import {
  AccountUpdate,
  Mina,
  PrivateKey,
  UInt64,
} from 'o1js';
import {
  ZkNoidTokenContract as FungibleToken,
  FungibleTokenAdmin,
} from '../build/src/index.js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = 'https://proxy.devnet.minaexplorer.com/graphql';
const fee = 1e8;

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

Mina.setActiveInstance(Mina.Network(url));

const adminKey = PrivateKey.fromBase58(process.env.ADMIN_PRIVATE_KEY!);

const [contract, adminContractKey, admin] = [
  PrivateKey.randomKeypair(),
  PrivateKey.randomKeypair(),
  {
    privateKey: adminKey,
    publicKey: adminKey.toPublicKey(),
  },
];

const feepayer = admin;

await FungibleToken.compile();
await FungibleTokenAdmin.compile();
const token = new FungibleToken(contract.publicKey);
const adminContract = new FungibleTokenAdmin(adminContractKey.publicKey);
let nonce = await getInferredNonce(feepayer.publicKey.toBase58());

console.log('Deploying token contract.');
const deployTx = await Mina.transaction(
  {
    sender: feepayer.publicKey,
    fee,
    nonce,
  },
  async () => {
    AccountUpdate.fundNewAccount(feepayer.publicKey, 2);
    await adminContract.deploy({ adminPublicKey: admin.publicKey });
    await token.deploy({
      admin: adminContractKey.publicKey,
    });
  }
);
await deployTx.prove();
deployTx.sign([
  feepayer.privateKey,
  contract.privateKey,
  adminContractKey.privateKey,
]);
const deployTxResult = await deployTx.send().then((v) => v.wait());
console.log('Deploy tx:', deployTxResult.hash);
console.log('Token address:', token.address.toBase58());

console.log('Minting new tokens to self.', feepayer, admin);
const mintTx = await Mina.transaction(
  {
    sender: feepayer.publicKey,
    fee,
  },
  async () => {
    await token.mint(admin.publicKey, new UInt64(100e9));
  }
);
