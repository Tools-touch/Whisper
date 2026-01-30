import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { SolanaDemo } from "../target/types/solana_demo";

describe("solana-demo", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.solanaDemo as Program<SolanaDemo>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("Initializes a profile", async () => {
    const handle = "alice";
    const encPk = new Uint8Array(32).fill(1);
    const [profilePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), Buffer.from(handle)],
      program.programId
    );

    const tx = await program.methods
      .initializeProfile(handle, Array.from(encPk), [provider.wallet.publicKey])
      .accounts({
        profile: profilePda,
        owner: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.profile.fetch(profilePda);
    expect(account.handle).to.equal(handle);
    expect(account.owner.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(account.allowlist.length).to.equal(1);
    console.log("Your transaction signature", tx);
  });
});
