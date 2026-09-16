import { decryptSecret } from './src/utils/encryption.js';
import { MongoClient } from 'mongodb';

async function run() {
  const uri = 'mongodb://swapnilshelke819_db_user:nLR4KBv0KRsz7FWp@ac-dnijpy6-shard-00-00.c11gqyk.mongodb.net:27017,ac-dnijpy6-shard-00-01.c11gqyk.mongodb.net:27017,ac-dnijpy6-shard-00-02.c11gqyk.mongodb.net:27017/AI_Agent?ssl=true&authSource=admin&replicaSet=atlas-q14n9y-shard-0&retryWrites=true&w=majority';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('AI_Agent');
  const userDocs = await db.collection('connectedaccounts').find({ provider: 'render' }).toArray();
  const token = decryptSecret(userDocs[0].accessTokenEncrypted);
  
  const projects = await db.collection('projects').find({ 'configuration.renderServiceId': { $exists: true } }).sort({createdAt: -1}).limit(1).toArray();
  const serviceId = projects[0].configuration.renderServiceId;
  
  const response = await fetch('https://api.render.com/v1/services/' + serviceId + '/deploys', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
  await client.close();
}
run().catch(console.error);
