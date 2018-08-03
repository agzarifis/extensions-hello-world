function queryPollRequest() {

  return {
    type: 'GET',
    url: backendUrl + '/poll/query',
    success: updatePoll,
    error: logError,
    headers: { 'Authorization': 'Bearer ' + token }
  }
}

function querySettingsRequest() {

  return {
    type: 'GET',
    url: backendUrl + '/settings/query',
    success: loadSettings,
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

  $(function() {

    // listen for incoming broadcast messages from our EBS
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

function updatePoll(poll) {
    // clear choices
    $("input[name=choice]").remove();

  if (poll) {
    // update the displayed poll text with the poll
    twitch.rig.log('Updating poll with text: ' + poll.text);
    $('#poll').text(poll.text);

    // update the displayed poll options with the options
    poll.options.forEach(function(optionText) {
        $('#choices').append("<input type='radio' name='choice' value="+optionText+"> "+optionText+" <br>");
    });

  } else {
    twitch.rig.log('Updating poll with default no-poll text');
    $('#poll').text(noPollDefaultText);
  }
}

function loadSettings(settingsObj) {
  twitch.rig.log('Loading the channel\'s settings');
  $.each(settingsObj, function(settingName, settingValue) {
    channelSettings[settingName] = settingValue;
    applySetting(settingName, settingValue);
  })
}

function applySetting(settingName, settingValue) {
  if (settingName === "backgroundColor") {
    const body = $('body');
    let style = body.attr('style');
    style += "background-color: "+settingValue+";";
    body.attr('style', style);
  }
}


