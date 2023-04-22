const fs = require('fs').promises;
const path = require('path');
const process = require('process');

const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

/** Sets the scope to access everything out of GMail */
const SCOPE = ['https://mail.google.com/'];

/** Includes all the required Google API related credentials */
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/** 'token.json' does not exist by default. It is created once a user logs in */
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

/** Custom Label Name, which will be used to organise mails */
const LABEL_NAME = 'Out of Office';


/** Custom Methods - Start */

/** Custom Methods - End */

/**
 * Generic Google API methods to log a user in
 * @link: https://developers.google.com/gmail/api/quickstart/nodejs
 */
const saveCredentials = async (client) => {
    const fileContent = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(fileContent);
    const key = keys.installed || keys.web;

    const token = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });

    await fs.writeFile(TOKEN_PATH, token);
};

const loadSavedCredentials = async () => {
    try {
        const token = await fs.readFileSync(TOKEN_PATH);
        const credentials = JSON.parse(token);
        return google.auth.fromJSON(credentials);
    } catch (e) {
        return null;
    }
};

const authorize = async () => {
    let client = await loadSavedCredentials();
    if (client) {
        return client;
    }

    client = await authenticate({
        scopes: SCOPE,
        keyfilePath: CREDENTIALS_PATH,
    });

    if (client.credentials) {
        saveCredentials(client);
    }
    return client;
};

authorize().then((res) => {
    console.log('Successfully logged in to Google!');
}).catch((err) => {
    console.log('Error logging in', err);
});