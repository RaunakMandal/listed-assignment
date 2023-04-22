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

/** HACK ALERT: This is a hacky way where the current user email is stored. */
let LOGGED_IN_USER = '';

/** Custom Methods - Start */

/** 
 * @function removeInboxLabelFromEmail
 * @param {GmailAuthedObject} gmail - Authenticated Gmail Object
 * @param {string} threadId - Thread ID of the email
 * @description - Removes the 'INBOX' label from the email
 * This is done so that the email is not visible in the inbox
 * and is only visible in the 'All Mail' section
 * 
 * HACK ALERT: This is a hacky way to remove the 'INBOX' label from the email
 * so that we do not iterate over the same email again and again.
 */
const removeInboxLabelFromThread = (gmail, threadId) => {
    gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: {
            removeLabelIds: ['INBOX'],
        },
    }).then((res) => {
        console.log(`Label removed from thread`);
    });
};


/**
 * @function addCustomLabelToEmail
 * @param {GmailAuthedObject} gmail - Authenticated Gmail Object
 * @param {string} threadId - Thread ID of the email
 * @description - Adds a custom label to the email
 */
const addCustomLabelToThread = async (gmail, threadId) => {
    const existingLabels = await gmail.users.labels.list({
        userId: 'me',
    });

    let customLabel = existingLabels.data.labels.find((label) => label.name === LABEL_NAME);
    if (!customLabel) {
        const createdLabel = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
                name: LABEL_NAME,
                messageListVisibility: 'show',
                labelListVisibility: 'labelShow',
            },
        });
        console.log(`Custom label created: ${LABEL_NAME}`);
        customLabel = createdLabel.data;
    };

    await gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: {
            addLabelIds: [customLabel.id],
            removeLabelIds: ['UNREAD'],
        },
    }).then((res) => {
        console.log(`Label added to thread`);
    });
};


/**
 * @function sendAwayMessage
 * @param {GmailAuthedObject} gmail - Authenticated Gmail Object
 * @param {Object} payload - Payload of the email
 * @param {string} threadId - Thread ID of the email
 * @description - Sends an away message to the sender of the email
 */
const sendAwayMessage = async (gmail, payload, threadId) => {
    const from = payload.headers.find((header) => header.name === 'From').value;
    const to = payload.headers.find((header) => header.name === 'To').value;
    const subject = payload.headers.find((header) => header.name === 'Subject').value;

    const body = `Hi,\n\I am out of office 🌴. I will get back to you soon when I come back 👋. \n\nRegards,\n${to}`;
    const message = [
        `From: ${to}`,
        `To: ${from}`,
        `Subject: Out of Office: ${subject}`,
        '',
        body,
    ].join('\n');

    await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: Buffer.from(message).toString('base64'),
            threadId,
            labelIds: ['INBOX'],
        }
    });
    console.log(`Away message sent to: ${from}`);
};

/**
 * @function checkIfNewThread
 * @param {Object} threadData - Thread Data of the email
 * @description - Checks if the email is a new thread or a reply to an existing thread
 * @returns {boolean} - Returns true if the email is inside a new thread
 */
const checkIfNewThread = async (gmail, threadData) => {
    const { messages } = threadData;

    if (messages.length === 1) {
        return true;
    }

    if (!LOGGED_IN_USER) {
        const user = await gmail.users.getProfile({
            userId: 'me',
        });
        LOGGED_IN_USER = user.data.emailAddress;
    }

    let isNewThread = true;

    for (const message of messages) {
        const { payload } = message;
        const { headers } = payload;
        const from = headers.find((header) => header.name === 'From');

        if (from.value.includes(LOGGED_IN_USER)) {
            isNewThread = false;
            break;
        }
    }
    return isNewThread;
};


/**
 * @function checkIfNewThread
 * @param {GmailAuthedObject} gmail - Authenticated Gmail Object
 * @param {string} threadId - Thread ID of the email
 * @description - Returns the thread data for a given thread ID
 */
const fetchThreadFromEmail = async (gmail, threadId) => {
    const thread = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
    });
    return thread;
};

/**
 * @function createLatestEmail
 * @param {Object} auth - Google API Auth Object
 * @description - Checks for the latest email in the inbox, then performs next steps
 */
const checkLatestEmail = async (auth) => {
    const gmail = google.gmail({ version: 'v1', auth });

    /**
     * @userId: 'me' - refers to the currently logged in user
     * @maxResults: 1 - As we are already checking email every 45-120 seconds,
     * I think it's safe to assume that there will be only '1' unread email.
     * It also helps to avoid unnecessary API calls.
     * @q: 'is:unread' - This is a query parameter, which will only return unread emails
     * @labelIds: ['INBOX'] - This will only include emails from the Inbox
     * @includeSpamTrash: false - This will not include Spam or Trash emails in the result
     */
    const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 1,
        q: 'is:unread',
        labelIds: ['INBOX'],
        includeSpamTrash: false,
    });

    /** Only if there is an unread email, we will proceed further */
    const latestEmail = res.data.messages[0];
    if (latestEmail) {
        try {
            const threadData = await fetchThreadFromEmail(gmail, latestEmail.threadId);
            const isNewThread = await checkIfNewThread(gmail, threadData.data);

            if (isNewThread) {
                console.log('New thread found. Starting to send the away message!');

                /**
                 * Sending the message payload of the first message from the thread
                 * as anyway we are going to send a new message to threads with
                 * only one message in it.
                 */
                await sendAwayMessage(gmail, threadData.data.messages[0].payload, latestEmail.threadId);
                await addCustomLabelToThread(gmail, latestEmail.threadId);

                console.log('Completed sending away message and adding custom label to the thread!');
            } else {
                console.log('Thread is not new. Skipping this iteration.');
                await removeInboxLabelFromThread(gmail, latestEmail.threadId);
            }
        } catch (err) {
            console.log('Error occured: ', err);
        }
    } else {
        console.log('No unread emails found');
        return;
    }
};

/** Custom Methods - End */

/** Google API Methods - Start */
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
        const token = await fs.readFile(TOKEN_PATH);
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
/** Google API Methods - End */

authorize().then((res) => {
    console.log('Successfully logged in to Google!');

    /**
     * Runs the checkLatestEmail methods every 45 seconds
     * Runs all the methods inside the function as well
     */
    setInterval(() => {
        checkLatestEmail(res);
    }, 45000);
}).catch((err) => {
    console.log('Error logging in', err);
});