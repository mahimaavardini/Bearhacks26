use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("QuEUe9gEFt6mY7z2fV3wtdJPK1SLVQ3kQW1pQ7fR1uE");

#[program]
pub mod queue_marketplace {
    use super::*;

    pub fn mint_spot(ctx: Context<MintSpot>, event_id: [u8; 32]) -> Result<()> {
        let spot = &mut ctx.accounts.spot;
        let event_state = &mut ctx.accounts.event_state;
        let clock = Clock::get()?;

        // Transfer rent-exempt amount to the spot account
        let spot_rent = Rent::get()?.minimum_balance(8 + QueueSpot::SIZE);
        let event_rent = Rent::get()?.minimum_balance(8 + EventState::SIZE);

        // Transfer rent for spot account
        **ctx.accounts.fee_payer.to_account_info().try_borrow_mut_lamports()? -= spot_rent;
        **spot.to_account_info().try_borrow_mut_lamports()? += spot_rent;

        // Transfer rent for event_state account if it's being created
        if event_state.event_id == [0; 32] {
            **ctx.accounts.fee_payer.to_account_info().try_borrow_mut_lamports()? -= event_rent;
            **event_state.to_account_info().try_borrow_mut_lamports()? += event_rent;
        }

        spot.owner = ctx.accounts.owner.key();
        spot.queue_position = event_state.next_position;
        spot.created_at = clock.unix_timestamp;
        spot.is_selling = false;
        spot.price_lamports = 0;
        spot.event_id = event_id;

        event_state.event_id = event_id;
        event_state.next_position = event_state
            .next_position
            .checked_add(1)
            .ok_or(QueueError::QueueOverflow)?;

        Ok(())
    }

    pub fn list_spot(ctx: Context<ListSpot>, price_lamports: u64) -> Result<()> {
        require!(price_lamports > 0, QueueError::InvalidPrice);

        let spot = &mut ctx.accounts.spot;
        spot.is_selling = true;
        spot.price_lamports = price_lamports;

        Ok(())
    }

    pub fn execute_swap(ctx: Context<ExecuteSwap>) -> Result<()> {
        let buyer_spot = &mut ctx.accounts.buyer_spot;
        let seller_spot = &mut ctx.accounts.seller_spot;

        require!(seller_spot.is_selling, QueueError::SpotNotForSale);
        require!(seller_spot.price_lamports > 0, QueueError::InvalidPrice);
        require!(buyer_spot.event_id == seller_spot.event_id, QueueError::MismatchedEvent);

        let price = seller_spot.price_lamports;
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.seller.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
        system_program::transfer(cpi_ctx, price)?;

        let old_buyer_position = buyer_spot.queue_position;
        buyer_spot.queue_position = seller_spot.queue_position;
        seller_spot.queue_position = old_buyer_position;

        buyer_spot.is_selling = false;
        buyer_spot.price_lamports = 0;

        seller_spot.is_selling = false;
        seller_spot.price_lamports = 0;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(event_id: [u8; 32])]
pub struct MintSpot<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    #[account(
        init,
        payer = fee_payer,
        space = 8 + QueueSpot::SIZE,
        seeds = [b"spot", owner.key().as_ref(), event_id.as_ref()],
        bump
    )]
    pub spot: Account<'info, QueueSpot>,
    #[account(
        init_if_needed,
        payer = fee_payer,
        space = 8 + EventState::SIZE,
        seeds = [b"event", event_id.as_ref()],
        bump
    )]
    pub event_state: Account<'info, EventState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ListSpot<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"spot", owner.key().as_ref(), spot.event_id.as_ref()],
        bump,
        has_one = owner @ QueueError::Unauthorized
    )]
    pub spot: Account<'info, QueueSpot>,
}

#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub seller: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"spot", buyer.key().as_ref(), buyer_spot.event_id.as_ref()],
        bump,
        has_one = buyer @ QueueError::Unauthorized
    )]
    pub buyer_spot: Account<'info, QueueSpot>,
    #[account(
        mut,
        seeds = [b"spot", seller.key().as_ref(), seller_spot.event_id.as_ref()],
        bump,
        has_one = seller @ QueueError::Unauthorized
    )]
    pub seller_spot: Account<'info, QueueSpot>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct QueueSpot {
    pub owner: Pubkey,
    pub queue_position: u32,
    pub created_at: i64,
    pub is_selling: bool,
    pub price_lamports: u64,
    pub event_id: [u8; 32],
}

impl QueueSpot {
    pub const SIZE: usize = 32 + 4 + 8 + 1 + 8 + 32;
}

#[account]
#[derive(Default)]
pub struct EventState {
    pub event_id: [u8; 32],
    pub next_position: u32,
}

impl EventState {
    pub const SIZE: usize = 32 + 4;
}

#[error_code]
pub enum QueueError {
    #[msg("Only the spot owner can run this instruction")]
    Unauthorized,
    #[msg("The requested spot is not listed for sale")]
    SpotNotForSale,
    #[msg("Price must be greater than 0")]
    InvalidPrice,
    #[msg("Spots must belong to the same event")]
    MismatchedEvent,
    #[msg("Queue reached u32 max")]
    QueueOverflow,
}