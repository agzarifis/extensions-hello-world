let token = "";
let tuid = "";

// because who wants to type this every time?
const twitch = window.Twitch.ext;

// base url for our backend
const backendUrl = 'https://localhost:8081';

const noPollDefaultText = 'No poll right now';

function queryPollRequest() {

  return {
    type: 'GET',
    url: backendUrl + '/poll/query',
    success: updatePoll,
    error: logError,
    headers: { 'Authorization': 'Bearer ' + token }
  }
}

twitch.onContext(function(context) {
    // twitch.actions.requestIdShare();
    twitch.rig.log(context);
});

twitch.onAuthorized(function(auth) {
    // save our credentials
    token = auth.token;
    tuid = auth.userId;

    twitch.rig.log('tuid: ' + tuid);

    // Use this pattern for enabling the response buttons
    // // enable the button
    // $('#create').removeAttr('disabled');

    $.ajax(queryPollRequest());
});

function updatePoll(poll) {
  if (poll) {
    twitch.rig.log('Updating poll with text: ' + poll.text);
    $('#poll').text(poll.text);
  } else {
    twitch.rig.log('Updating poll with default no-poll text');
    $('#poll').text(noPollDefaultText);
  }
}

function logError(_, error, status) {
  twitch.rig.log('EBS request returned '+status+' ('+error+')');
}

$(function() {

    // listen for incoming broadcast message from our EBS
    twitch.listen('broadcast', function (target, contentType, poll) {
        twitch.rig.log('Received broadcast poll');
        updatePoll(poll);
    });
});
