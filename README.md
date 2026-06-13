# Escrow

A token-for-token escrow program built with Anchor 1.0.2, supporting both SPL Token and Token-2022 (Token Extensions) mints via the `Interface`/`InterfaceAccount` account types.

## Overview

A `maker` deposits an amount of `mint_a` tokens into a vault and specifies how much of `mint_b` they want in return. A `taker` can then fulfill the trade by sending `mint_b` to the maker and receiving the escrowed `mint_a` tokens. The maker can also cancel the trade and reclaim their tokens via `refund`.

## Instructions

### `make`
- **Args:** `seed: u64`, `receive: u64`, `deposit: u64`
- Creates the `escrow` PDA (seeded by `["escrow", maker, seed]`) and an associated `vault` token account owned by the escrow PDA.
- Transfers `deposit` amount of `mint_a` from `maker_ata_a` into the `vault`.
- Records `maker`, `mint_a`, `mint_b`, and the `receive` amount in the `escrow` account.

### `take`
- **Args:** none — the seed/bump needed to derive and sign for the `escrow` PDA are read from the on-chain `escrow` account itself.
- Transfers `escrow.receive` amount of `mint_b` from `taker_ata_b` to `maker_ata_b`.
- Transfers the full `vault` balance of `mint_a` to `taker_ata_a`, then closes the `vault` and the `escrow` account (rent returned to `maker`).

### `refund`
- **Args:** none
- Returns the escrowed `mint_a` tokens from `vault` back to `maker_ata_a`.
- Closes the `vault` and the `escrow` account (rent returned to `maker`).

## Account/Program Types

This program is written against Anchor 1.0.x conventions:

- `InterfaceAccount<'info, Mint>` / `InterfaceAccount<'info, TokenAccount>` — accept mints/token accounts owned by either the legacy SPL Token program or Token-2022.
- `Interface<'info, TokenInterface>` — accepts either token program as the `token_program`.
- `transfer_checked` / `close_account` — used instead of the legacy `transfer` to support mint decimal validation and Token-2022 extensions (transfer fees, transfer hooks, etc.).
- Large `InterfaceAccount` fields (`mint_a`, `mint_b`, `taker_ata_a` in `Take`) are wrapped in `Box<...>` to keep the account-deserialization stack frame under the 4KB BPF stack limit.
- Each instruction has an explicit single-byte discriminator (`make = 0`, `take = 1`, `refund = 2`).

## Project Structure

```
programs/escrow/src/
├── lib.rs              # program entrypoint, instruction discriminators
├── constants.rs        # ESCROW_SEED
├── error.rs            # custom error codes
├── state.rs            # Escrow account
└── instructions/
    ├── make.rs
    ├── take.rs
    └── refund.rs

tests/
└── escrow.ts           # end-to-end Anchor TS tests
```

## Setup

```bash
yarn install
```

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

The test suite (`tests/escrow.ts`):

1. Airdrops SOL to the maker (provider wallet) and taker.
2. Creates two SPL Token mints (`mintA`, `mintB`) and the relevant ATAs, minting tokens to the maker (`mintA`) and taker (`mintB`).
3. **Make** — maker creates the escrow and deposits `mintA` tokens into the vault.
4. **Take** — *(currently skipped via `xit`)* taker fulfills the trade, swapping `mintB` for the escrowed `mintA`, closing the vault and escrow accounts.
5. **Refund** — maker cancels the escrow and reclaims the deposited `mintA` tokens, closing the vault and escrow accounts.

> Note: Run either the **Take** or **Refund** test in isolation per escrow — both close the same `escrow`/`vault` accounts, so they can't both succeed against the same `make` in one run.
