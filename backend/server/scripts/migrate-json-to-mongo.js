/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const serverRoot = path.resolve(__dirname, '..');
const aiRoot = path.resolve(serverRoot, '..', 'ai-engine');

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'trafiq';

if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function geoFromCamera(camera) {
  if (!camera.location) return undefined;
  return {
    type: 'Point',
    coordinates: [camera.location.longitude, camera.location.latitude],
  };
}

function geoFromIncident(incident) {
  if (!incident.location) return undefined;
  return {
    type: 'Point',
    coordinates: [incident.location.longitude, incident.location.latitude],
  };
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const now = new Date();

  const incidents = readJsonl(path.join(aiRoot, 'incidents.jsonl'));
  for (const incident of incidents) {
    await db.collection('incidents').updateOne(
      { incident_id: incident.incident_id },
      {
        $set: {
          ...incident,
          location: geoFromIncident(incident),
          updatedAt: now,
          migratedFrom: 'incidents.jsonl',
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const cameraConfig = readJson(path.join(aiRoot, 'cameras.json'), {
    cameras: [],
  });
  for (const camera of cameraConfig.cameras || []) {
    await db.collection('cameras').updateOne(
      { id: camera.id },
      {
        $set: {
          ...camera,
          geo: geoFromCamera(camera),
          updatedAt: now,
          migratedFrom: 'cameras.json',
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const users = readJson(path.join(serverRoot, 'data', 'users.json'), []);
  for (const user of users) {
    await db.collection('users').updateOne(
      { emailLower: user.email.toLowerCase() },
      {
        $set: {
          ...user,
          emailLower: user.email.toLowerCase(),
          updatedAt: now,
          migratedFrom: 'users.json',
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const counts = readJson(path.join(aiRoot, 'vehicle_counts.json'), null);
  if (counts) {
    const timestamp = new Date(counts.timestamp || Date.now());
    const snapshotId = `${timestamp.toISOString()}_${counts.total || 0}`;
    await db
      .collection('vehicle_counts')
      .updateMany(
        { latest: true },
        { $set: { latest: false, updatedAt: now } },
      );
    await db.collection('vehicle_counts').updateOne(
      { snapshotId },
      {
        $set: {
          snapshotId,
          latest: true,
          snapshot: counts,
          timestamp,
          updatedAt: now,
          migratedFrom: 'vehicle_counts.json',
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  console.log(
    `Migrated ${incidents.length} incidents, ${(cameraConfig.cameras || []).length} cameras, ${users.length} users`,
  );
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
