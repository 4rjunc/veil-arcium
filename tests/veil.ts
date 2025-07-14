import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgAddress,
  uploadCircuit,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
} from "@arcium-hq/client";
import { x25519 } from '@noble/curves/ed25519';
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";
import { Veil } from "../target/types/veil";

describe("ShareMedicalRecords", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace
    .Veil as Program<Veil>;
  const provider = anchor.getProvider();

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(eventName: E) => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);

    return event;
  };

  const arciumEnv = getArciumEnv();

  function walletAddressToBigInt(address) {
    const publicKey = new PublicKey(address);
    const bytes = publicKey.toBytes();

    let bigIntValue = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      bigIntValue = (bigIntValue << BigInt(8)) + BigInt(bytes[i]);
    }

    return bigIntValue;
  }

  function bigIntToWalletAddress(bigIntValue) {
    const bytes = [];

    for (let i = 0; i < 32; i++) {
      bytes.unshift(Number(bigIntValue & BigInt(0xff)));
      bigIntValue >>= BigInt(8);
    }

    const publicKey = new PublicKey(Uint8Array.from(bytes));
    return publicKey.toBase58();
  }


  async function handleBidFlow({
    program,
    cipher,
    bidData,
    provider,
    senderPublicKey,
    owner,
    arciumEnv,
    mxePublicKey,
  }: {
    program: anchor.Program;
    cipher: any;
    bidData: [bigint, bigint];
    provider: anchor.AnchorProvider;
    senderPublicKey: Uint8Array;
    owner: anchor.web3.Keypair;
    arciumEnv: { arciumClusterPubkey: anchor.web3.PublicKey };
    mxePublicKey: Uint8Array;
  }) {
    console.log("handleBidFlow2")
    const nonce = randomBytes(16);
    const ciphertext = cipher.encrypt(bidData, nonce);

    const storeSig = await program.methods
      .storePatientData(ciphertext[0], ciphertext[1])
      .accounts({
        payer: owner.publicKey,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });

    console.log("Store sig is ", storeSig);

    const receiverSecretKey = x25519.utils.randomPrivateKey();
    const receiverPubKey = x25519.getPublicKey(receiverSecretKey);
    const receiverNonce = randomBytes(16);

    const receivedBidDataEventPromise = awaitEvent("bidDataEvent");

    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const queueSig = await program.methods
      .sharePatientData(
        computationOffset,
        Array.from(receiverPubKey),
        new anchor.BN(deserializeLE(receiverNonce).toString()),
        Array.from(senderPublicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(program.programId, computationOffset),
        clusterAccount: arciumEnv.arciumClusterPubkey,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(program.programId),
        executingPool: getExecutingPoolAccAddress(program.programId),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("share_patient_data")).readUInt32LE()
        ),
        patientData: PublicKey.findProgramAddressSync(
          [Buffer.from("patient_data"), owner.publicKey.toBuffer()],
          program.programId
        )[0],
      })
      .rpc({ commitment: "confirmed" });

    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const receiverSharedSecret = x25519.getSharedSecret(receiverSecretKey, mxePublicKey);
    const receiverCipher = new RescueCipher(receiverSharedSecret);

    const receivedBidDataEvent = await receivedBidDataEventPromise;

    const decryptedFields = receiverCipher.decrypt(
      [receivedBidDataEvent.bidder, receivedBidDataEvent.bid],
      new Uint8Array(receivedBidDataEvent.nonce)
    );

    expect(decryptedFields[0]).to.equal(bidData[0], "Wallet Address mismatch");
    expect(decryptedFields[1]).to.equal(bidData[1], "Bid mismatch");

    console.log("decryptedFields: ");
    for (let i = 0; i < 2; i++) {
      console.log(decryptedFields[i]);
    }

    const originalAddress = bigIntToWalletAddress(BigInt(decryptedFields[0]));
    console.log("Wallet address:", originalAddress);

    console.log("All bid data fields successfully decrypted and verified");
  }

  it("can store and share patient data confidentially!", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const owner2 = readKpJson(`${os.homedir()}/.config/solana/id_dev.json`);


    await airdropToWallets(provider.connection, owner, owner2);

    // Initialize computation definition ONLY ONCE
    console.log("Initializing share patient data computation definition");
    const initSPDSig = await initSharePatientDataCompDef(program, owner, false);
    console.log(
      "Share patient data computation definition initialized with signature",
      initSPDSig
    );

    // Setup for first user
    const senderPrivateKey = x25519.utils.randomPrivateKey();
    const senderPublicKey = x25519.getPublicKey(senderPrivateKey);
    const mxePublicKey = new Uint8Array([
      34, 56, 246, 3, 165, 122, 74, 68, 14, 81, 107, 73, 129, 145, 196, 4, 98,
      253, 120, 15, 235, 108, 37, 198, 124, 111, 38, 1, 210, 143, 72, 87,
    ]);
    const sharedSecret = x25519.getSharedSecret(senderPrivateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    // bidData 1
    // const walletAddress = "8EwoWotLUEipf2rAtje738n6NX3LkhGKbtBCx9Z4RBDb";
    // const bidder = walletAddressToBigInt(walletAddress);
    const bidder = BigInt(101);
    const bid = BigInt(1_000_000_000);
    const bidData = [bidder, bid];
    console.log(`bidData: ${bidData}`);

    // Setup for second user (NO SECOND INITIALIZATION)
    const senderPrivateKey2 = x25519.utils.randomPrivateKey();
    const senderPublicKey2 = x25519.getPublicKey(senderPrivateKey2);
    const sharedSecret2 = x25519.getSharedSecret(senderPrivateKey2, mxePublicKey);
    const cipher2 = new RescueCipher(sharedSecret2);

    // const walletAddress2 = "9yxM9jTRyeaSxpS957i1jrwoGcr2RnMXwnbAwQHCUnkU";
    // const bidder2 = walletAddressToBigInt(walletAddress2);
    const bidder2 = BigInt(102);
    const bid2 = BigInt(2_000_000_000);
    const bidData2 = [bidder2, bid2];
    console.log(`bidData2: ${bidData2}`);

    // Execute flows for both users
    await handleBidFlow({
      program,
      cipher,
      bidData,
      provider,
      senderPublicKey,
      owner,
      arciumEnv,
      mxePublicKey,
    });

    await handleBidFlow({
      program,
      cipher: cipher2,
      bidData: bidData2,
      provider,
      senderPublicKey: senderPublicKey2,
      owner: owner2,
      arciumEnv,
      mxePublicKey,
    });
  });

  async function initSharePatientDataCompDef(
    program: Program<Veil>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("share_patient_data");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    const sig = await program.methods
      .initSharePatientDataCompDef()
      .accounts({
        compDefAccount: compDefPDA,
        payer: owner.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
      })
      .signers([owner])
      .rpc({
        commitment: "confirmed",
      });
    console.log(
      "Init share patient data computation definition transaction",
      sig
    );

    if (uploadRawCircuit) {
      const rawCircuit = fs.readFileSync("build/share_patient_data.arcis");

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "share_patient_data",
        program.programId,
        rawCircuit,
        true
      );
    } else {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx);
    }
    return sig;
  }
});

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}


async function airdropToWallets(connection: anchor.web3.Connection, ...wallets: anchor.web3.Keypair[]) {
  for (const wallet of wallets) {
    console.log(`Airdropping to ${wallet.publicKey.toBase58()}`);
    const sig = await connection.requestAirdrop(wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`Airdrop complete for ${wallet.publicKey.toBase58()}`);
  }
}
