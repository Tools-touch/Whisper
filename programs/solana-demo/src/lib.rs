use anchor_lang::prelude::*;

declare_id!("D4vno1rrteswpFM3SSfzvJwyPzSkQKCiN6WfEuK7qGyS");

pub const MAX_HANDLE_LEN: usize = 32;
pub const MAX_ALLOWLIST_LEN: usize = 32;

#[program]
pub mod solana_demo {
    use super::*;

    pub fn initialize_profile(
        ctx: Context<InitializeProfile>,
        handle: String,
        enc_pk: [u8; 32],
        allowlist: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            !handle.is_empty() && handle.len() <= MAX_HANDLE_LEN,
            ErrorCode::InvalidHandle
        );
        require!(
            allowlist.len() <= MAX_ALLOWLIST_LEN,
            ErrorCode::AllowlistTooLarge
        );

        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.owner.key();
        profile.handle = handle;
        profile.enc_pk = enc_pk;
        profile.allowlist = allowlist;
        profile.bump = ctx.bumps.profile;
        Ok(())
    }

    pub fn update_enc_pk(ctx: Context<UpdateEncPk>, new_enc_pk: [u8; 32]) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.enc_pk = new_enc_pk;
        Ok(())
    }

    pub fn update_allowlist(
        ctx: Context<UpdateAllowlist>,
        allowlist: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            allowlist.len() <= MAX_ALLOWLIST_LEN,
            ErrorCode::AllowlistTooLarge
        );
        let profile = &mut ctx.accounts.profile;
        profile.allowlist = allowlist;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(handle: String)]
pub struct InitializeProfile<'info> {
    #[account(
        init,
        payer = owner,
        space = Profile::SIZE,
        seeds = [b"profile", handle.as_bytes()],
        bump
    )]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateEncPk<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [b"profile", profile.handle.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAllowlist<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [b"profile", profile.handle.as_bytes()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
    pub owner: Signer<'info>,
}

#[account]
pub struct Profile {
    pub owner: Pubkey,
    pub handle: String,
    pub enc_pk: [u8; 32],
    pub allowlist: Vec<Pubkey>,
    pub bump: u8,
}

impl Profile {
    pub const SIZE: usize = 8  // discriminator
        + 32                 // owner
        + 4 + MAX_HANDLE_LEN // handle
        + 32                 // enc_pk
        + 4 + (32 * MAX_ALLOWLIST_LEN) // allowlist
        + 1;                 // bump
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid handle length.")]
    InvalidHandle,
    #[msg("Allowlist exceeds maximum size.")]
    AllowlistTooLarge,
}
