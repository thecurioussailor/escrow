import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Escrow } from "../target/types/escrow";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { randomBytes } from "crypto";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SYSTEM_PROGRAM_ID } from "@anchor-lang/core/dist/cjs/native/system";
import { expect } from "chai";

const commitment = "confirmed";

describe("escrow", () => {

    const confirmTx = async (signature: string) => {
        const latestBlockhash = await anchor.getProvider().connection.getLatestBlockhash();
        await anchor.getProvider().connection.confirmTransaction(
            {
                signature,
                ...latestBlockhash,
            },
            commitment
        )
    }

    const confirmTxs = async (signatures: string[]) => {
         await Promise.all(signatures.map(confirmTx));
    }

    const provider = anchor.AnchorProvider.env();

    anchor.setProvider(provider);

    const program = anchor.workspace.escrow as Program<Escrow>;

    const connection = provider.connection;

    //maker
    const payer = provider.wallet as NodeWallet;

    //taker
    const taker = Keypair.generate();

    let mintA: PublicKey;
    let mintB: PublicKey;

    let makerAtaA: PublicKey;
    let makerAtaB: PublicKey;
    let takerAtaA: PublicKey;
    let takerAtaB: PublicKey;

    let vault: PublicKey;

    const seed = new BN(randomBytes(8));

    let escrow = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), payer.publicKey.toBuffer(), seed.toBuffer("le", 8)],
        program.programId
    )[0];

    it("Request airdrop to payer and taker", async () => {
        await Promise.all([payer, taker].map(async (k) => {
            return await anchor.getProvider().connection.requestAirdrop(k.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
        })).then(confirmTxs);
    })
     
    it("Mint Tokens to Maker and Taker", async () => {

        //creating mints
        mintA = await createMint(
            connection,
            payer.payer,
            provider.publicKey,
            provider.publicKey,
            6
        )

        console.log("Mint A: ", mintA.toBase58());

        mintB = await createMint(
            connection,
            payer.payer,
            provider.publicKey,
            provider.publicKey,
            6
        )
        
        console.log("Mint B: ", mintB.toBase58());

        vault = getAssociatedTokenAddressSync(
            mintA,
            escrow,
            true,
        );

        makerAtaA = (await getOrCreateAssociatedTokenAccount(
            connection,
            payer.payer,
            mintA,
            provider.publicKey,

        )).address;

        makerAtaB = (await getOrCreateAssociatedTokenAccount(
            connection,
            payer.payer,
            mintB,
            provider.publicKey,
        )).address;

        takerAtaA = (await getOrCreateAssociatedTokenAccount(
            connection,
            payer.payer,
            mintA,
            taker.publicKey,
        )).address;

        takerAtaB = (await getOrCreateAssociatedTokenAccount(
            connection,
            payer.payer,
            mintB,
            taker.publicKey,
        )).address;

        //mint some tokens
        await mintTo(
            connection,
            payer.payer,
            mintA,
            makerAtaA,
            payer.payer,
            1000_000_000,
        );

        console.log("Minted 1000 tokens to makerAtaA", makerAtaA.toBase58());

        await mintTo(
            connection,
            payer.payer,
            mintB,
            takerAtaB,
            payer.payer,
            1000_000_000,
        );

        console.log("Minted 1000 tokens to takerAtaB", takerAtaB.toBase58());

    })

    it("Make!", async () => {

        const initialMakerAtaABalance = await provider.connection.getTokenAccountBalance(makerAtaA);
        console.log("Initial makerAtaA balance:", initialMakerAtaABalance.value.amount)

        const tx = await program.methods.make(
            seed,
            new BN(1_000_000),
            new BN(1_000_000)
        )
        .accountsStrict({
            maker: payer.publicKey,
            mintA: mintA,
            mintB: mintB,
            makerAtaA: makerAtaA,
            escrow: escrow,
            vault: vault,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID
        })
        .rpc();

        await confirmTx(tx);

        const finalVaultBalance = await provider.connection.getTokenAccountBalance(vault);
        console.log("Vault Balance:", finalVaultBalance.value.amount);

        const finalMakerAtaABalance = await provider.connection.getTokenAccountBalance(makerAtaA);
        console.log("Final makerAtaA Balance:", finalMakerAtaABalance.value.amount);

        console.log("Make Tx: ", tx);
    })

    xit("Take!", async () => {

        const tx = await program.methods.take(
        )
        .accountsStrict({
            taker: taker.publicKey,
            maker: payer.publicKey,
            mintA: mintA,
            mintB: mintB,
            takerAtaA: takerAtaA,
            takerAtaB: takerAtaB,
            makerAtaB: makerAtaB,
            escrow: escrow,
            vault: vault,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID
        })
        .signers([taker])
        .rpc();

        await confirmTx(tx);

        expect(await provider.connection.getBalance(vault)).to.equal(0);

        const vaultStateInfo = await provider.connection.getAccountInfo(vault);

        expect(vaultStateInfo).to.be.null;

        console.log("Take tx: ", tx);
    })

    it("Refund!", async () => {
        const tx = await program.methods.refund(

        )
        .accountsStrict({
            maker: payer.publicKey,
            mintA: mintA,
            makerAtaA: makerAtaA,
            escrow: escrow,
            vault: vault,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID
        })
        .rpc();

        await confirmTx(tx);

        expect(await provider.connection.getBalance(vault)).to.equal(0);
        const vaultStateInfo = await provider.connection.getAccountInfo(vault);
        expect(vaultStateInfo).to.be.null;

        console.log("Take tx: ", tx);
    });
});