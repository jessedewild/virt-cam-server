const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const cors = require('cors');
const https = require('https');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

const privateKey = fs.readFileSync('server.key', 'utf8');
const certificate = fs.readFileSync('server.cert', 'utf8');

const credentials = { key: privateKey, cert: certificate };

// const httpsServer = https.createServer(credentials, app);

let whipServerUrl = null;
let streamingRoom = null;

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

    // Execute child_process commands
    exec(
      `./simple-whip-client/whip-client -u ${whipServerUrl}/endpoint/${room}board -V "v4l2src device=/dev/video0 ! video/x-raw,width=960,height=720,framerate=30/1 ! videoconvert ! queue ! x264enc bitrate=1500000 tune=zerolatency speed-preset=superfast ! h264parse ! rtph264pay pt=96 config-interval=1 ssrc=80700 ! queue ! application/x-rtp,media=video,encoding-name=H264,payload=96"`
    );

    exec(
      `./simple-whip-client/whip-client -u ${whipServerUrl}/endpoint/${room}player -V "v4l2src device=/dev/video1 ! video/x-raw,width=960,height=720,framerate=30/1 ! videoconvert ! queue ! x264enc bitrate=1500000 tune=zerolatency speed-preset=superfast ! h264parse ! rtph264pay pt=96 config-interval=1 ssrc=80701 ! queue ! application/x-rtp,media=video,encoding-name=H264,payload=96"`
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('Error making POST requests or running commands:', error);
    res.status(500).send('An error occurred');
  }
});

app.get('/status', (req, res) => {
  res.json({ room: streamingRoom });
});

const PORT = 8070;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
