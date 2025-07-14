use anchor_lang::prelude::*;
use arcium_anchor::{
    comp_def_offset, derive_cluster_pda, derive_comp_def_pda, derive_comp_pda, derive_execpool_pda,
    derive_mempool_pda, derive_mxe_pda, init_comp_def, queue_computation, ComputationOutputs,
    ARCIUM_CLOCK_ACCOUNT_ADDRESS, ARCIUM_STAKING_POOL_ACCOUNT_ADDRESS, CLUSTER_PDA_SEED,
    COMP_DEF_PDA_SEED, COMP_PDA_SEED, EXECPOOL_PDA_SEED, MEMPOOL_PDA_SEED, MXE_PDA_SEED,
};
use arcium_client::idl::arcium::{
    accounts::{
        ClockAccount, Cluster, ComputationDefinitionAccount, PersistentMXEAccount,
        StakingPoolAccount,
    },
    program::Arcium,
    types::Argument,
    ID_CONST as ARCIUM_PROG_ID,
};
use arcium_macros::{
    arcium_callback, arcium_program, callback_accounts, init_computation_definition_accounts,
    queue_computation_accounts,
};

const COMP_DEF_OFFSET_SHARE_PATIENT_DATA: u32 = comp_def_offset("share_patient_data");

declare_id!("7s7rwJCWD8vLi4ADcHRESmimPwxCMBobMJf3sXTgQj6P");

#[arcium_program]
pub mod veil {
    use super::*;

    pub fn store_patient_data(
        ctx: Context<StorePatientData>,
        bidder: [u8; 32],
        bid: [u8; 32],
    ) -> Result<()> {
        let patient_data = &mut ctx.accounts.bidder_data;
        patient_data.bidder = bidder;
        patient_data.bid = bid;
        Ok(())
    }

    pub fn init_share_patient_data_comp_def(
        ctx: Context<InitSharePatientDataCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, true, None, None)?;
        Ok(())
    }

    pub fn share_patient_data(
        ctx: Context<SharePatientData>,
        computation_offset: u64,
        receiver: [u8; 32],
        receiver_nonce: u128,
        sender_pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let args = vec![
            Argument::ArcisPubkey(receiver),
            Argument::PlaintextU128(receiver_nonce),
            Argument::ArcisPubkey(sender_pub_key),
            Argument::PlaintextU128(nonce),
            Argument::Account(
                ctx.accounts.patient_data.key(),
                8,
                BidderData::INIT_SPACE as u32,
            ),
        ];
        queue_computation(ctx.accounts, computation_offset, args, vec![], None)?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "share_patient_data")]
    pub fn share_patient_data_callback(
        ctx: Context<SharePatientDataCallback>,
        output: ComputationOutputs,
    ) -> Result<()> {
        let bytes = if let ComputationOutputs::Bytes(bytes) = output {
            bytes
        } else {
            return Err(ErrorCode::AbortedComputation.into());
        };

        let bytes = bytes.iter().skip(32).cloned().collect::<Vec<_>>();

        emit!(BidDataEvent {
            nonce: bytes[0..16].try_into().unwrap(),
            bidder: bytes[16..48].try_into().unwrap(),
            bid: bytes[48..80].try_into().unwrap(),
        });
        Ok(())
    }
}
#[derive(Accounts)]
pub struct StorePatientData<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + BidderData::INIT_SPACE,
        seeds = [b"patient_data", payer.key().as_ref()],
        bump,
    )]
    pub bidder_data: Account<'info, BidderData>,
}

#[queue_computation_accounts("share_patient_data", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SharePatientData<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, PersistentMXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_SHARE_PATIENT_DATA)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_STAKING_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, StakingPoolAccount>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS,
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    pub patient_data: Account<'info, BidderData>,
}

#[callback_accounts("share_patient_data", payer)]
#[derive(Accounts)]
pub struct SharePatientDataCallback<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_SHARE_PATIENT_DATA)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("share_patient_data", payer)]
#[derive(Accounts)]
pub struct InitSharePatientDataCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, PersistentMXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct BidDataEvent {
    pub nonce: [u8; 16],
    pub bidder: [u8; 32],
    pub bid: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct BidderData {
    pub bidder: [u8; 32],
    pub bid: [u8; 32],
}

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
}
