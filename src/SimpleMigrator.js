import { AtpAgent } from '@atproto/api';

class SimpleMigrator {
  constructor(targetPdsUrl) {
    this.targetPdsUrl = targetPdsUrl;
    this.oldAgent = null;
    this.newAgent = new AtpAgent({ service: targetPdsUrl });
  }

  async migrate({ oldHandle, password, email, handle, inviteCode, statusUpdateHandler = null, twoFactorCode = null }) {
    const safeUpdate = (msg) => statusUpdateHandler && statusUpdateHandler(msg);

    // Clean up handle copy/paste issues
    oldHandle = oldHandle.replace('@', '').trim().replace(/[\u202A\u202C\u200E\u200F\u2066-\u2069]/g, '');

    // Login to old PDS (default bsky.social for entry)
    safeUpdate('Logging into old PDS...');
    const oldAgent = new AtpAgent({ service: 'https://bsky.social' });
    if (twoFactorCode) {
      await oldAgent.login({ identifier: oldHandle, password, authFactorToken: twoFactorCode });
    } else {
      await oldAgent.login({ identifier: oldHandle, password });
    }

    // Get DID
    const didRes = await oldAgent.com.atproto.identity.resolveHandle({ handle: oldHandle });
    const usersDid = didRes.data.did;

    // Create account on new PDS
    safeUpdate('Creating account on new PDS...');
    const newHostDesc = await this.newAgent.com.atproto.server.describeServer();
    const newHostWebDid = newHostDesc.data.did;

    const createAuthResp = await oldAgent.com.atproto.server.getServiceAuth({
      aud: newHostWebDid,
      lxm: 'com.atproto.server.createAccount',
    });
    const serviceJwt = createAuthResp.data.token;

    const accountReq = { did: usersDid, handle, email, password };
    if (inviteCode) accountReq.inviteCode = inviteCode;

    await this.newAgent.com.atproto.server.createAccount(accountReq, {
      headers: { authorization: `Bearer ${serviceJwt}` },
      encoding: 'application/json',
    });

    // Login to new PDS
    safeUpdate('Logging into new PDS...');
    await this.newAgent.login({ identifier: usersDid, password });

    // Repo migration
    safeUpdate('Migrating repo...');
    const repoRes = await oldAgent.com.atproto.sync.getRepo({ did: usersDid });
    await this.newAgent.com.atproto.repo.importRepo(repoRes.data, {
      encoding: 'application/vnd.ipld.car',
    });

    // Blobs migration
    safeUpdate('Migrating blobs...');
    let blobCursor;
    do {
      const listedBlobs = await oldAgent.com.atproto.sync.listBlobs({ did: usersDid, cursor: blobCursor, limit: 100 });
      for (const cid of listedBlobs.data.cids) {
        try {
          const blobRes = await oldAgent.com.atproto.sync.getBlob({ did: usersDid, cid });
          await this.newAgent.com.atproto.repo.uploadBlob(blobRes.data, {
            encoding: blobRes.headers['content-type'],
          });
        } catch (err) {
          console.error('Blob migration error:', err);
        }
      }
      blobCursor = listedBlobs.data.cursor;
    } while (blobCursor);

    // Preferences migration
    safeUpdate('Migrating preferences...');
    const prefs = await oldAgent.app.bsky.actor.getPreferences();
    await this.newAgent.app.bsky.actor.putPreferences(prefs.data);

    // Request PLC operation signature
    safeUpdate('Requesting PLC token via email...');
    await oldAgent.com.atproto.identity.requestPlcOperationSignature();

    this.oldAgent = oldAgent;
  }

  async signPlcOperation(token, statusUpdateHandler = null) {
    const safeUpdate = (msg) => statusUpdateHandler && statusUpdateHandler(msg);

    safeUpdate('Signing PLC operation...');
    const getDidCredentials = await this.newAgent.com.atproto.identity.getRecommendedDidCredentials();
    const rotationKeys = getDidCredentials.data.rotationKeys ?? [];
    const credentials = { ...getDidCredentials.data, rotationKeys };

    const plcOp = await this.oldAgent.com.atproto.identity.signPlcOperation({ token, ...credentials });
    await this.newAgent.com.atproto.identity.submitPlcOperation({ operation: plcOp.data.operation });

    await this.newAgent.com.atproto.server.activateAccount();
    await this.oldAgent.com.atproto.server.deactivateAccount({});

    safeUpdate('✅ Migration complete!');
  }
}

export { SimpleMigrator };