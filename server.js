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
let stoppingBoardCmd = false;
let playerCmd = null;
let stoppingPlayerCmd = false;

app.post('/start', async (req, res) => {
  const { whip_server_url, whip_server_token, room, board_cam_display, player_cam_display } = req.body;

  console.log(`Starting streaming to ` + whip_server_url, room);

  if (streamingRoom) {
    res.status(401).json({ message: 'Already streaming', room: streamingRoom });
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
      stoppingBoardCmd = true;
      boardCmd.kill();
    }

    boardCmd = spawn(
      './simple-whip-client/whip-client',
      [
        '-u',
        `${whipServerUrl}/endpoint/${room}board`,
        '-t',
        whip_server_token,
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
      if (!stoppingBoardCmd) {
        console.error(`Board cam closed unexpectedly`);
      }
      stoppingBoardCmd = false;
      console.log(`Board cam process exited with code ${code}`);
    });

    if (playerCmd) {
      console.log(`Stopping existing player cam process`);
      stoppingPlayerCmd = true;
      playerCmd.kill();
    }

    playerCmd = spawn(
      './simple-whip-client/whip-client',
      [
        '-u',
        `${whipServerUrl}/endpoint/${room}player`,
        '-t',
        whip_server_token,
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
      if (!stoppingPlayerCmd) {
        console.error(`Player cam closed unexpectedly`);
      }
      stoppingPlayerCmd = false;
      console.log(`Player cam process exited with code ${code}`);
    });

    res.status(200).json();
  } catch (error) {
    console.error('Error making POST requests or running commands:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

app.get('/stop', async (req, res) => {
  if (!whipServerUrl || !streamingRoom) {
    res.status(400).json();
    return;
  }

  if (boardCmd) {
    stoppingBoardCmd = true;

    console.log(`Stopping board cam process`);
    boardCmd.kill();
    boardCmd = null;
  } else {
    console.error(`No board cam process`);
  }

  await axios.delete(`${whipServerUrl}/endpoint/${streamingRoom}board`);

  if (playerCmd) {
    stoppingPlayerCmd = true;

    console.log(`Stopping player cam process`);
    playerCmd.kill();
    playerCmd = null;
  } else {
    console.error(`No player cam process`);
  }

  await axios.delete(`${whipServerUrl}/endpoint/${streamingRoom}player`);

  streamingRoom = null;

  res.status(200).json();
});

app.get('/status', (req, res) => {
  res.json({ room: streamingRoom });
});

const PORT = 8070;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
