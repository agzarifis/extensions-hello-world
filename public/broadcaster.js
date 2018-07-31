function createPollRequest(text) {

  return {
    type: 'POST',
    url: backendUrl + '/poll/create',
    data: {'text': text},
    error: logError,
    headers: { 'Authorization': 'Bearer ' + token }
  }
}

function queryPollRequest() {

  return {
    type: 'GET',
    url: backendUrl + '/poll/query',
    error: logError,
    headers: { 'Authorization': 'Bearer ' + token }
  }
}

function clearPollRequest() {

  return {
    type: 'POST',
    url: backendUrl + '/poll/reset',
    error: logError,
    headers: { 'Authorization': 'Bearer ' + token }
  }
}

function querySettingsRequest() {

  return {
    type: 'GET',
    url: backendUrl + '/settings/query',
    error: logError,
    headers: { 'Authorization': 'Bearer ' + token }
  }
}

twitch.onContext(function(context) {
  // twitch.actions.requestIdShare();
  // twitch.rig.log(context);
});

twitch.onAuthorized(function(auth) {
  // save our credentials
  token = auth.token;
  tuid = auth.userId;

  twitch.rig.log('tuid: ' + tuid);

  // enable the button
  $('#create').removeAttr('disabled');

  // enable the text field
  $('#input').removeAttr('disabled');

  $(function() {

    // when we click the create button
    $('#create').click(function() {
      if(!token) { return twitch.rig.log('Not authorized'); }
      twitch.rig.log('Creating a poll');
      var pollText = $('#input').val();
      $.ajax(createPollRequest(pollText));
    });

    // when we hit enter while typing in the text box
    $("#input").keyup(function(event) {
      if (event.keyCode === 13) {
        $("#create").click();
      }
    });

    $("#clear").click(function() {
      if(!token) { return twitch.rig.log('Not authorized'); }
      twitch.rig.log('Clearing the poll');
      $.ajax(clearPollRequest());
    });

    // listen for incoming broadcast message from our EBS
    twitch.listen('broadcast', function (target, contentType, message) {
      twitch.rig.log('Received broadcasted '+message.type+' message');
      parseMessage(message);
    });

    // listen for incoming whisper messages from our EBS
    twitch.listen(tuid, function (target, contentType, message) {
      twitch.rig.log('Received whispered '+message.type+' message for uid: '+tuid);
      parseMessage(message);
    });

    $.ajax(querySettingsRequest());
    $.ajax(queryPollRequest());
  });
});

function applySetting(settingName, settingValue) {
  if (settingName === "backgroundColor") {
    const body = $('body');
    let style = body.attr('style');
    style += "background-color: "+settingValue+";";
    body.attr('style', style);
  }
}

function loadSettings(settingsObj) {
  twitch.rig.log('Loading the channel\'s settings');
  $.each(settingsObj, function(settingName, settingValue) {
    channelSettings[settingName] = settingValue;
    applySetting(settingName, settingValue);
  })
}

function updatePoll(poll) {
  // erase the input field
  $('#input').val('');

  // if there is a poll in the response
  if (poll) {
    // update the displayed poll text with the poll
    twitch.rig.log('Updating poll with text: ' + poll.text);
    $('#poll').text(poll.text);

    // enable the clear button
    $('#clear').removeAttr('disabled');

  // if no poll in the response
  } else {
    // update the displayed poll text with the default no-poll text
    twitch.rig.log('Updating poll with default no-poll text');
    $('#poll').text(noPollDefaultText);

    // disable the clear button
    $('#clear').attr('disabled','disabled');
  }
}


