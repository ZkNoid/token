import { AccountUpdate, Mina, PrivateKey, PublicKey, UInt64 } from 'o1js';
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

const [admin] = [
  {
    privateKey: adminKey,
    publicKey: adminKey.toPublicKey(),
  },
];

const feepayer = admin;

await FungibleToken.compile();
await FungibleTokenAdmin.compile();
const token = new FungibleToken(
  PublicKey.fromBase58(
    'B62qnGGXBJzD2SmeGAcZZSAgcknbU9R21B97vxFFKmQrFrVZQakrzDX'
  )
);

console.log('Token address:', token.address.toBase58());

const nonce = await getInferredNonce(feepayer.publicKey.toBase58());

const transferTx = await Mina.transaction(
  {
    sender: admin.publicKey,
    fee,
    nonce,
  },
  async () => {
    AccountUpdate.fundNewAccount(feepayer.publicKey, 1);
    await token.transfer(
      feepayer.publicKey,
      PublicKey.fromBase58(
        'B62qpjxUpgdjzwQfd8q2gzxi99wN7SCgmofpvw27MBkfNHfHoY2VH32'
      ),
      new UInt64(100e9)
    );
  }
);

await transferTx.prove();
transferTx.sign([feepayer.privateKey]);
const transferTxResult = await transferTx.send().then((v) => v.wait());
console.log('Transfer tx:', transferTxResult.hash);
