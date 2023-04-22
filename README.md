## Vacation Email Auto Response App
This app uses your Gmail Inbox messages, and when it finds there is an unread mail, it replied to the email automatically.

### Libraries Used
1. `@google-cloud/local-auth` - Helps in authorizing the user using provided credentials from `.json` file.
2. `googleapis` - Allows us to uses all the required APIs needed for Gmail, Drive, or any other Google Services.

### How to Run the App
This app requires the Gmail API Credentails to be present, which is not included in this Repo for security perposes.

However, to get your own Credentials to use this app, please follow the steps mentioned in this guide: https://developers.google.com/gmail/api/quickstart/nodejs

### Areas of Improvement
I have taken only the latest email thread in consideration, which is fine as we are calling the API every 45 seconds, but we can iterate through maybe 5-10 mails at a time as well.