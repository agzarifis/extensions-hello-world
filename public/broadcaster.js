function createPollRequest(pollObj) {


  return {
    type: 'POST',
    url: backendUrl + '/poll/create',
    data: JSON.stringify(pollObj),
    error: logError,
    contentType: "application/json; charset=utf-8",
    headers: { 'Authorization': 'Bearer ' + token }
  }
}

function queryPollRequest() {

  return {
    type: 'GET',
    url: backendUrl + '/poll/query',
    success: updatePoll,
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

  // enable the create poll button
  $('#create').removeAttr('disabled');

  // enable the poll text field
  $('#input').removeAttr('disabled');
  
  // enable the add option button
  $('#add_option').removeAttr('disabled');
  
  $(function() {
    
    // when we click the create button
    $('#create').click(function() {
      if(!token) { return twitch.rig.log('Not authorized'); }
      twitch.rig.log('Creating a poll');
      let pollText = $('#input').val();
      let optionText = [];
      $("input[id^=option]").each(function() {
        optionText.push($(this).val());
      });

      let pollObj = createPollObject(pollText, optionText);
      $.ajax(createPollRequest(pollObj));
    });

    // when we hit enter while typing in the text box
    $("#input").keyup(function(event) {
      if (event.keyCode === 13) {
        $("#create").click();
      }
    });
    
    //when we click the add_option button
    $('#add_option').click(function() {
      let lastOptionCount = parseInt($("[id^=option]").last().attr('id').slice(6)) || 0;
      let thisOptionCount = lastOptionCount + 1;
      $('#options').append("<li><input type='text' id='option"+thisOptionCount+"' placeholder='Option "+thisOptionCount+"'></li>");
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
  // erase the input field and empty options
  $('#input').val('');
  $('#options').empty();

  // if there is a poll in the response
  if (poll) {
    // update the displayed poll text with the poll
    twitch.rig.log('Updating poll with text: ' + poll.text);
    $('#poll').text(poll.text);
    twitch.rig.log('Updating poll with options: ' + poll.options.toString().replace(/,/g,", "));

    poll.options.forEach(function(optionText) {
      $('#choices').append("<div>"+optionText+"</div>");
    });


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

function createPollObject(pollText, pollOptionsText) {
  return {
    "text": pollText,
    "options": pollOptionsText
  };
}