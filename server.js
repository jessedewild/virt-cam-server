const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

let whipServerUrl = null;
let streamingRoom = null;

let boardCmd = null;
let playerCmd = null;

app.post('/start', async (req, res) => {
  const { whip_server_url, room, board_cam_display, player_cam_display } = req.body;

  console.log(`Starting streaming to ` + whip_server_url, room);

  if (streamingRoom) {
    res.status(401).send({ message: 'Already streaming', room: streamingRoom });
    return;
  }

  whipServerUrl = whip_server_url;

  try {
    // Make POST requests for board and player cam displays
    await axios.post(whipServerUrl + '/create', {
      id: room + 'board',
      room: room,
      label: board_cam_display,
    });

    await axios.post(whipServerUrl + '/create', {
      id: room + 'player',
      room: room,
      label: player_cam_display,
    });

    // Store the room
    streamingRoom = room;

    if (boardCmd) {
      console.log(`Stopping existing board cam process`);
      boardCmd.kill('SIGKILL');
    }

    boardCmd = spawn(
      './simple-whip-client/whip-client',
      [
        '-u',
        `${whipServerUrl}/endpoint/${room}board`,
        '-V',
        '"v4l2src device=/dev/video0 ! video/x-raw,width=960,height=720,framerate=30/1 ! videoconvert ! queue ! x264enc tune=zerolatency bitrate=1500 speed-preset=ultrafast ! rtph264pay config-interval=5 pt=96 ssrc=1 ! queue ! application/x-rtp,media=video,encoding-name=H264,payload=96"',
      ],
      {
        shell: true,
        detached: true,
      }
    );
    boardCmd.stdout.on('data', (data) => {
      console.log(`[BOARD]: ${data}`);
    });
    boardCmd.stderr.on('data', (data) => {
      console.error(`[BOARD]: ${data}`);
    });
    boardCmd.on('close', (code) => {
      console.log(`Board cam process exited with code ${code}`);
    });

    if (playerCmd) {
      console.log(`Stopping existing player cam process`);
      playerCmd.kill('SIGKILL');
    }

    playerCmd = spawn(
      './simple-whip-client/whip-client',
      [
        '-u',
        `${whipServerUrl}/endpoint/${room}player`,
        '-V',
        '"v4l2src device=/dev/video1 ! video/x-raw,width=960,height=720,framerate=30/1 ! videoconvert ! queue ! x264enc tune=zerolatency bitrate=1500 speed-preset=ultrafast ! rtph264pay config-interval=5 pt=96 ssrc=2 ! queue ! application/x-rtp,media=video,encoding-name=H264,payload=96"',
      ],
      {
        shell: true,
        detached: true,
      }
    );
    playerCmd.stdout.on('data', (data) => {
      console.log(`[PLAYER]: ${data}`);
    });
    playerCmd.stderr.on('data', (data) => {
      console.error(`[PLAYER]: ${data}`);
    });
    playerCmd.on('close', (code) => {
      console.log(`Player cam process exited with code ${code}`);
    });

    res.sendStatus(200);
  } catch (error) {
    console.error('Error making POST requests or running commands:', error);
    res.status(500).send('An error occurred');
  }
});

app.get('/stop', async (req, res) => {
  if (!whipServerUrl || !streamingRoom) {
    res.sendStatus(400);
    return;
  }

  if (boardCmd) {
    console.log(`Stopping board cam process`);
    boardCmd.kill('SIGKILL');
    boardCmd = null;
  } else {
    console.error(`No board cam process`);
  }

  await axios.delete(`${whipServerUrl}/endpoint/${streamingRoom}board`);

  if (playerCmd) {
    console.log(`Stopping player cam process`);
    playerCmd.kill('SIGKILL');
    playerCmd = null;
  } else {
    console.error(`No player cam process`);
  }

  await axios.delete(`${whipServerUrl}/endpoint/${streamingRoom}player`);

  streamingRoom = null;

  res.sendStatus(200);
});

app.get('/status', (req, res) => {
  res.json({ room: streamingRoom });
});

const PORT = 8070;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
