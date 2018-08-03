const settingsSuccessMessage = "Settings updated successfully";

function saveSettingsRequest(settingsObj) {

  return {
    type: 'POST',
    url: backendUrl + '/settings/update',
    data: JSON.stringify(settingsObj),
    success: updateFeedback,
    error: logError,
    contentType: "application/json; charset=utf-8",
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

twitch.onContext((context) => {
  // twitch.rig.log(context);
});

twitch.onAuthorized((auth) => {
  token = auth.token;
  tuid = auth.userId;

  twitch.rig.log("uid: "+tuid);

  $(function() {
    const form = $("form");
    const saveBtn = $("#save");

    // when we click the save button
    saveBtn.click(function() {
      if(!token) { return twitch.rig.log('Not authorized'); }
      twitch.rig.log('Saving the settings:');

      const settingsObj = {};
      const formData = form.serializeArray();
      $.each(formData, function(i, setting) {
        twitch.rig.log(setting.name+" = "+setting.value);
        settingsObj[setting.name] = setting.value;
      });

      $.ajax(saveSettingsRequest(settingsObj));
    });

    // listen for incoming whisper messages from our EBS
    twitch.listen(tuid, function (target, contentType, message) {
      twitch.rig.log('Received whispered '+message.type+' message for uid: '+tuid);
      parseMessage(message);
    });

    $.ajax(querySettingsRequest());
  });
});

function loadSettings(settingsObj) {
  twitch.rig.log('Loading the channel\'s settings');
  $.each(settingsObj, function(settingName, settingValue) {
    channelSettings[settingName] = settingValue;
    prefillForm(settingName, settingValue);
  })
}

function prefillForm(settingName, settingValue) {
  $("input[name='"+settingName+"'][value='"+settingValue+"']").attr('checked','true');
}

function updateFeedback(settingsObj) {
  $("#feedback").text(settingsSuccessMessage);
}