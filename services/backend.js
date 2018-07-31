/**
 *    Copyright 2018 Amazon.com, Inc. or its affiliates
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

const fs = require('fs');
const Hapi = require('hapi');
const path = require('path');
const Boom = require('boom');
const AWS = require('aws-sdk');
const ext = require('commander');
const jwt = require('jsonwebtoken');
const request = require('request');

// The developer rig uses self-signed certificates.  Node doesn't accept them
// by default.  Do not use this in production.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Use verbose logging during development.  Set this to false for production.
const verboseLogging = true;
const verboseLog = verboseLogging ? console.log.bind(console) : () => { };

// AWS Config
AWS.config.update({
  region: "us-west-1"
});

// Service state variables
const db = new AWS.DynamoDB.DocumentClient();
const serverTokenDurationSec = 30;          // our tokens for pubsub expire after 30 seconds
const userCooldownMs = 1000;                // maximum input rate per user to prevent bot abuse
const userCooldownClearIntervalMs = 60000;  // interval to reset our tracking object
const channelCooldownMs = 1000;             // maximum broadcast rate per channel
const bearerPrefix = 'Bearer ';             // HTTP authorization headers have this prefix
const channelCooldowns = {};                // rate limit compliance
const localRigApi = 'localhost.rig.twitch.tv:3000'
const twitchApi = 'api.twitch.tv'
let userCooldowns = {};                     // spam prevention

function missingOnline(name, variable) {
  const option = name.charAt(0);
  return `Extension ${name} required in online mode.\nUse argument "-${option} <${name}>" or environment variable "${variable}".`;
}

const STRINGS = {
  secretEnv: 'Using environment variable for secret',
  clientIdEnv: 'Using environment variable for client-id',
  ownerIdEnv: 'Using environment variable for owner-id',
  secretLocal: 'Using local mode secret',
  clientIdLocal: 'Using local mode client-id',
  ownerIdLocal: 'Using local mode owner-id',
  serverStarted: 'Server running at %s',
  secretMissing: missingOnline('secret', 'EXT_SECRET'),
  clientIdMissing: missingOnline('client ID', 'EXT_CLIENT_ID'),
  ownerIdMissing: missingOnline('owner ID', 'EXT_OWNER_ID'),
  messageSendError: 'Error sending message to channel %s: %s',
  pubsubResponse: 'Message to c:%s returned %s',
  messageBroadcast: 'Broadcasting %s for c:%s',
  messageWhisper: 'Whispering %s to u:%s for c:%s',
  sendPoll: 'Sending poll to c:%s',
  sendNullPoll: 'Sending null poll to c:%s',
  createPoll: 'Created poll with text: %s for c:%s',
  clearPoll: 'Cleared poll for c:%s',
  updateSettings: 'Updated settings for c:%s',
  sendSettings: 'Sending settings for c:%s',
  cooldown: 'Please wait before clicking again',
  invalidJwt: 'Invalid JWT',
  nonBroadcaster: 'Only the broadcaster can update the poll',
  nonBroadcasterIdentified: 'Viewer %s is attempting to update the poll',
  nullPoll: "The text of a poll may not be null"
};

ext.
  version(require('../package.json').version).
  option('-s, --secret <secret>', 'Extension secret').
  option('-c, --client-id <client_id>', 'Extension client ID').
  option('-o, --owner-id <owner_id>', 'Extension owner ID').
  option('-l, --local <manifest_file>', 'Developer rig local mode').
  parse(process.argv);

const ownerId = getOption('ownerId', 'ENV_OWNER_ID', '100000001');
const secret = Buffer.from(getOption('secret', 'ENV_SECRET', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk'), 'base64');
let clientId;
if (ext.local) {
  const localFileLocation = path.resolve(process.cwd(), ext.local);
  clientId = require(localFileLocation).clientId;
}
clientId = getOption('clientId', 'ENV_CLIENT_ID', clientId);

// Get options from the command line, environment, or, if local mode is
// enabled, the local value.
function getOption(optionName, environmentName, localValue) {
  if (ext[optionName]) {
    return ext[optionName];
  } else if (process.env[environmentName]) {
    console.log(STRINGS[optionName + 'Env']);
    return process.env[environmentName];
  } else if (ext.local) {
    console.log(STRINGS[optionName + 'Local']);
    return localValue;
  }
  console.log(STRINGS[optionName + 'Missing']);
  process.exit(1);
}

const server = new Hapi.Server({
  host: 'localhost',
  port: 8081,
  tls: {
    // If you need a certificate, execute "npm run cert".
    key: fs.readFileSync(path.resolve(__dirname, '../conf/server.key')),
    cert: fs.readFileSync(path.resolve(__dirname, '../conf/server.crt')),
  },
  routes: {
    cors: {
      origin: ['*'],
    },
  },
});

// Verify the header and the enclosed JWT.
function verifyAndDecode(header) {
  if (header.startsWith(bearerPrefix)) {
    try {
      const token = header.substring(bearerPrefix.length);
      return jwt.verify(token, secret, { algorithms: ['HS256'] });
    }
    catch (ex) {
    }
  }
  throw Boom.unauthorized(STRINGS.invalidJwt);
}

function pollQueryHandler(req) {
  // Verify all requests.
  const authHeaders = verifyAndDecode(req.headers.authorization);
  const { channel_id: channelId, opaque_user_id: userId } = authHeaders;

  // Get the current poll for the channel and return it
  const params = {
    TableName: 'polls',
    Key: {
      channelId: channelId,
    }
  };

  db.get(params, function(err, data) {
    if (err) {
      verboseLog("DB error: " + err);
    } else {
      let pollObj;
      if (Object.getOwnPropertyNames(data).length === 0) {
        pollObj = null;
      } else {
        pollObj = data.Item.poll;
      }
      verboseLog("DB success: poll for c:" + channelId + " retrieved");
      attemptMessageSend(channelId, pollObj, "poll", userId);
      verboseLog(STRINGS.sendPoll, channelId);
    }
  });

  return null;
}

function pollCreateHandler(req) {
  // Verify all requests.
  const authHeaders = verifyAndDecode(req.headers.authorization);

  // Get the desired poll for the channel from the request.
  const { channel_id: channelId, role: role, opaque_user_id: userId } = authHeaders;
  const pollObj = req.payload;

  // Only allow for updating the poll when the requesting user is the broadcaster
  if (role === 'broadcaster') {

    // Only update the poll if the text is non-null
    if (pollObj.text) {

      // Save the new poll for the channel - DB VERSION
      let params = {
        TableName: 'polls',
        Item: {
          channelId: channelId,
          poll: pollObj
        }
      };

      db.put(params, function(err, data) {
        if (err) {
          verboseLog("DB error: " + err);
        } else {
          verboseLog("DB success: " + data);
          attemptMessageSend(channelId, pollObj, "poll");
          verboseLog(STRINGS.createPoll, pollObj.text, channelId);
        }
      });

      return null;
    } else {
      throw Boom.badRequest(STRINGS.nullPoll);
    }
  } else {
    verboseLog(STRINGS.nonBroadcasterIdentified, userId);
    throw Boom.unauthorized(STRINGS.nonBroadcaster);
  }
}

function pollResetHandler(req) {
  // Verify all requests.
  const authHeaders = verifyAndDecode(req.headers.authorization);
  const { channel_id: channelId, role: role, opaque_user_id: userId } = authHeaders;

  // Only allow for clearing the poll when the requesting user is the broadcaster
  if (role === 'broadcaster') {

    let params = {
      TableName: 'polls',
      Key: {
        channelId: channelId
      }
    };

    db.delete(params, function(err, data) {
      if (err) {
        verboseLog("DB error: " + err);
      } else {
        verboseLog("DB success: " + data);
        attemptMessageSend(channelId, null, "poll");
        verboseLog(STRINGS.clearPoll, channelId);
      }
    });

    return null
  } else {
    verboseLog(STRINGS.nonBroadcasterIdentified, userId);
    throw Boom.unauthorized(STRINGS.nonBroadcaster);
  }
}

function channelSettingsUpdateHandler(req) {
  // Verify all requests.
  const authHeaders = verifyAndDecode(req.headers.authorization);
  const { channel_id: channelId, role: role, opaque_user_id: userId } = authHeaders;

  const settingsObj = req.payload;

  // Only allow for updating the settings when the requesting user is the broadcaster
  if (role === 'broadcaster') {

    // Only update the poll if non-null
    if (settingsObj) {

      // Save the settings for the channel
      let params = {
        TableName: 'channelSettings',
        Item: {
          channelId: channelId,
          settings: settingsObj
        }
      };

      db.put(params, function(err, data) {
        if (err) {
          verboseLog("DB error: " + err);
        } else {
          verboseLog("DB success: " + data);
          attemptMessageSend(channelId, settingsObj, "success", userId);
          verboseLog(STRINGS.updateSettings, channelId);
        }
      });

      return null;
    } else {
      throw Boom.badRequest(STRINGS.nullPoll);
    }
  } else {
    verboseLog(STRINGS.nonBroadcasterIdentified, userId);
    throw Boom.unauthorized(STRINGS.nonBroadcaster);
  }
}

function channelSettingsQueryHandler(req) {
  // Verify all requests.
  const authHeaders = verifyAndDecode(req.headers.authorization);
  const { channel_id: channelId, opaque_user_id: userId } = authHeaders;

  // Get the settings for the channel and return them
  const params = {
    TableName: 'channelSettings',
    Key: {
      channelId: channelId,
    }
  };

  db.get(params, function(err, data) {
    if (err) {
      verboseLog("DB error: " + err);
    } else {
      const settingsObj = data.Item.settings;
      verboseLog("DB success: settings for c:" + channelId + " retrieved");
      attemptMessageSend(channelId, settingsObj, "settings", userId);
      verboseLog(STRINGS.sendSettings, channelId);
    }
  });

  return null;
}

function attemptMessageSend(channelId, messageContent, messageType, userId) {
  // Check the cool-down to determine if it's okay to send now.
  const now = Date.now();
  const cooldown = channelCooldowns[channelId];
  if (!cooldown || cooldown.time < now) {
    // It is.
    sendMessage(channelId, messageContent, messageType, userId);
    channelCooldowns[channelId] = { time: now + channelCooldownMs };
  } else {
    // It isn't; schedule a delayed broadcast if we haven't already done so.
    setTimeout(sendMessage, now - cooldown.time, channelId, messageContent, messageType, userId);
    channelCooldowns[channelId] = { time: now + channelCooldownMs };
  }
}

function determineTargets(channelId, messageType, userId) {
  // Determine if sending to a single user or all users
  let targets = [];
  if (userId) {
    targets = [userId];
    verboseLog(STRINGS.messageWhisper, messageType, userId, channelId);
  } else {
    targets = ['broadcast'];
    verboseLog(STRINGS.messageBroadcast, messageType, channelId);
  }
  return targets;
}

function generateHeaders(channelId) {
  // Set the HTTP headers required by the Twitch API.
  return {
    'Client-Id': clientId,
    'Content-Type': 'application/json',
    'Authorization': bearerPrefix + makeServerToken(channelId)
  }
}

function generateMessage(messageContent, messageType) {
  return {"type": messageType, "content": messageContent}
}

function createReqBody(message, targets) {
  // Create the POST body for the Twitch API request.
  return JSON.stringify({
    content_type: 'application/json',
    message: message,
    targets: targets,
  })
}

function sendMessage(channelId, messageContent, messageType, userId) {
  const headers = generateHeaders(channelId);

  const targets = determineTargets(channelId, messageType, userId);

  const message = generateMessage(messageContent, messageType);

  const body = createReqBody(message, targets);

  // Send the request to the Twitch API.
  const apiHost = ext.local ? localRigApi : twitchApi;
  request(
    `https://${apiHost}/extensions/message/${channelId}`,
    {
      method: 'POST',
      headers,
      body,
    }
    , (err, res) => {
      if (err) {
        console.log(STRINGS.messageSendError, channelId, err);
      } else {
        verboseLog(STRINGS.pubsubResponse, channelId, res.statusCode);
      }
    });
}

// Create and return a JWT for use by this service.
function makeServerToken(channelId) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + serverTokenDurationSec,
    channel_id: channelId,
    user_id: ownerId, // extension owner ID for the call to Twitch PubSub
    role: 'external',
    pubsub_perms: {
      send: ['*'],
    },
  };
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

function userIsInCooldown(opaqueUserId) {
  // Check if the user is in cool-down.
  const cooldown = userCooldowns[opaqueUserId];
  const now = Date.now();
  if (cooldown && cooldown > now) {
    return true;
  }

  // Voting extensions must also track per-user votes to prevent skew.
  userCooldowns[opaqueUserId] = now + userCooldownMs;
  return false;
}

(async () => {
  // Handle a new viewer requesting the current poll
  server.route({
    method: 'GET',
    path: '/poll/query',
    handler: pollQueryHandler,
  });

  // Handle a viewer answering the current poll
  // server.route({
  //   method: 'POST',
  //   path: '/poll/response',
  //   handler: pollResponseHandler,
  // });

  // Handle the broadcaster defining the poll
  server.route({
    method: 'POST',
    path: '/poll/create',
    handler: pollCreateHandler,
  });

  // Handle the broadcaster clearing the current poll
  server.route({
    method: 'POST',
    path: '/poll/reset',
    handler: pollResetHandler,
  });

  // Handle the broadcaster updating the settings
  server.route({
    method: 'POST',
    path: '/settings/update',
    handler: channelSettingsUpdateHandler,
  });

  // Handle the broadcaster/viewer querying the settings
  server.route({
    method: 'GET',
    path: '/settings/query',
    handler: channelSettingsQueryHandler,
  });

  // Start the server.
  await server.start();
  console.log(STRINGS.serverStarted, server.info.uri);

  // Periodically clear cool-down tracking to prevent unbounded growth due to
  // per-session logged-out user tokens.
  setInterval(() => { userCooldowns = {}; }, userCooldownClearIntervalMs);
})();
