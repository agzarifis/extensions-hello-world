let token = "";
let tuid = "";

// because who wants to type this every time?
const twitch = window.Twitch.ext;

// base url for our backend
const backendUrl = 'https://localhost:8081';

const noPollDefaultText = 'No poll right now';

function createPollRequest(text, options) {

  return {
    type: 'POST',
    url: backendUrl + '/poll/create',
    data: {'text': text, 'options': options},
    success: updatePoll,
    error: logError,
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

  twitch.rig.log('upon auth, tuid: ' + tuid);

  // enable the create poll button
  $('#create').removeAttr('disabled');

  // enable the poll text field
  $('#input').removeAttr('disabled');

  // enable the add option button
  $('#add_option').removeAttr('disabled');

  $.ajax(queryPollRequest());
});

function updatePoll(poll) {
  // erase the input field and empty options
  $('#input').val('');
  $('#options').empty();

  // if there is a poll in the response
  if (poll) {
    // update the displayed poll text with the poll
    twitch.rig.log('Updating poll with text: ' + poll.text);
    $('#poll').text(poll.text);
    twitch.rig.log('Updating poll with options: ' + poll.options);
    $('#choices').append("<div>poll.options</div>");

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

function logError(_, error, status) {
  twitch.rig.log('EBS request returned '+status+' ('+error+')');
}

$(function() {

  //when we click the add_option button
  $('#add_option').click(function() {
    let lastOptionCount = parseInt($("[id^=option]").last().attr('id').slice(6)) || 0;
    let thisOptionCount = lastOptionCount + 1;
    $('#options').append("<li><input type='text' id='option"+thisOptionCount+"' placeholder='Option "+thisOptionCount+"'></li>");
  });

  // when we click the create button
  $('#create').click(function() {
    if(!token) { return twitch.rig.log('Not authorized'); }
    twitch.rig.log('Creating a poll');
    let pollText = $('#input').val();
    let optionText = [];
    $("input[id^=option]").each(function() {
      optionText.push($(this).val());
    });
    $.ajax(createPollRequest(pollText, optionText));
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
  twitch.listen('broadcast', function (target, contentType, poll) {
    twitch.rig.log('Received broadcast poll');
    updatePoll(poll);
  });
});

