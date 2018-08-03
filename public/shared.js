const twitch = window.Twitch.ext;

let token = "";
let tuid = "";

// base url for our backend
const backendUrl = 'https://localhost:8081';

const channelSettings = {};

const noPollDefaultText = 'No poll right now';

function parseMessage(message) {
  const messageType = message.type;
  const messageContent = message.content;
  if (messageType === "poll") {
    updatePoll(messageContent);
  } else if (messageType === "settings") {
    loadSettings(messageContent);
  } else if (messageType === "success") {
    updateFeedback(messageContent);
  }
}

function logError(_, error, status) {
  twitch.rig.log('EBS request returned '+status+' ('+error+')');
}