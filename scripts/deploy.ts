import {
  AccountUpdate,
  Mina,
  PrivateKey,
  PublicKey,
  TokenId,
  UInt64,
} from 'o1js';
import { ZkNoidTokenContract as FungibleToken } from '../build/src/index.js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = 'https://proxy.devnet.minaexplorer.com/graphql';
const fee = 1e8;

type KeyPair = { publicKey: PublicKey; privateKey: PrivateKey };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getInferredNonce(publicKey: string) {
  const query = `
query {
  account(publicKey: "${publicKey}") {
    inferredNonce
  }
}`;

  const json = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ operationName: null, query, variables: {} }),
    headers: { 'Content-Type': 'application/json' },
  }).then((v) => v.json());
  return Number(json.data.account.inferredNonce);
}

async function sendNoWait(
  feepayer: KeyPair,
  from: KeyPair,
  to: PublicKey,
  amount: number,
  payCreationFee: boolean
) {
  const nonce = await getInferredNonce(feepayer.publicKey.toBase58());
  console.log('feepayer nonce:', nonce);
  const transferTx = await Mina.transaction(
    {
      sender: feepayer.publicKey,
      fee,
      nonce,
    },
    async () => {
      if (payCreationFee) {
        AccountUpdate.fundNewAccount(feepayer.publicKey, 1);
      }
      await token.transfer(from.publicKey, to, new UInt64(amount));
    }
  );
  await transferTx.prove();

  transferTx.sign([from.privateKey, feepayer.privateKey]);
  const result = await transferTx.send();
  console.log('Transfer tx:', result.hash);

  // 3 sec for node to update nonce
  await sleep(3000);
}

Mina.setActiveInstance(Mina.Network(url));

const feePayerKey = PrivateKey.fromBase58(
  'EKE5nJtRFYVWqrCfdpqJqKKdt2Sskf5Co2q8CWJKEGSg71ZXzES7'
);

const adminKey = PrivateKey.fromBase58(process.env.ADMIN_PRIVATE_KEY!);

const [contract, admin] = [
  PrivateKey.randomKeypair(),
  {
    privateKey: adminKey,
    publicKey: adminKey.toPublicKey(),
  },
];

await FungibleToken.compile();
const token = new FungibleToken(contract.publicKey);

const feepayer = admin;

let nonce = await getInferredNonce(feepayer.publicKey.toBase58());

console.log('Deploying token contract.');
const deployTx = await Mina.transaction(
  {
    sender: feepayer.publicKey,
    fee,
    nonce,
  },
  async () => {
    AccountUpdate.fundNewAccount(feepayer.publicKey, 1);
    await token.deploy({
      owner: feepayer.publicKey,
    });
  }
);
await deployTx.prove();
deployTx.sign([feepayer.privateKey, contract.privateKey]);
const deployTxResult = await deployTx.send().then((v) => v.wait());
console.log('Deploy tx:', deployTxResult.hash);
console.log('Token address', token.address.toBase58());

// console.log("Minting new tokens to admin.")
// const mintTx = await Mina.transaction({
//   sender: feepayer.publicKey,
//   fee,
// }, async () => {
//   AccountUpdate.fundNewAccount(feepayer.publicKey, 1)
//   await token.mint(alexa.publicKey, new UInt64(100e9))
// })
// await mintTx.prove()
// mintTx.sign([feepayer.privateKey])
// const mintTxResult = await mintTx.send()
// console.log("Mint tx:", mintTxResult.hash)
// await mintTxResult.wait()
