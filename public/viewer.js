var token = "";
var tuid = "";

// because who wants to type this every time?
var twitch = window.Twitch.ext;

// base url for our backend
var backendUrl = 'https://localhost:8081';

function createPollRequest(text, textA, textB) {

    return {
        type: 'POST',
        url: backendUrl + '/poll/create',
        data: {'text': text, 'textA': textA, 'textB': textB},
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
    success: clearPoll,
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
    twitch.rig.log('upon auth, token: ' + token);
    twitch.rig.log('upon auth, tuid: ' + tuid);

    // enable the button
    $('#create').removeAttr('disabled');

    // enable the text field
    $('#input').removeAttr('disabled');

    //enable option A
    $('#optionA').removeAttr('disabled');

    //enable option B
    $('#optionB').removeAttr('disabled');

    setAuth(token);
    $.ajax(queryPollRequest());
});

function updatePoll(poll, choiceA, choiceB) {
  twitch.rig.log('Updating poll');
  $('#poll').text(poll.text);
  $('#choiceA').text(choiceA.textA);
  $('#choiceB').text(choiceB.textB);

  // enable the clear button
  $('#clear').removeAttr('disabled');
}

function clearPoll(poll) {
  twitch.rig.log('Clearing poll');
  $('#poll').text(poll.text);

  // disable the clear button
  $('#clear').addAttr('disabled');
}

function logError(_, error, status) {
  twitch.rig.log('EBS request returned '+status+' ('+error+')');
}

$(function() {

    // when we click the create button
    $('#create').click(function() {
        if(!token) { return twitch.rig.log('Not authorized'); }
        twitch.rig.log('Creating a poll');
        var pollText = $('#input').val();
        var optionAText = $('#optionA').val();
        var optionBText = $('#optionB').val();
        $.ajax(createPollRequest(pollText, optionAText, optionBText));
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
