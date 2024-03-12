import express, { Request, Response } from 'express';
import axios from 'axios';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

let whipServerUrl: string | null = null;
let streamingRoom: string | null = null;

let boardCmd: ChildProcessWithoutNullStreams | null = null;
let stoppingBoardCmd: boolean = false;
let playerCmd: ChildProcessWithoutNullStreams | null = null;
let stoppingPlayerCmd: boolean = false;

interface StartRequestBody {
  whip_server_url: string;
  whip_server_token: string;
  room: string;
  board_cam_display: string;
  player_cam_display: string;
}

app.post('/start', async (req: Request<{}, {}, StartRequestBody>, res: Response) => {
  const { whip_server_url, whip_server_token, room, board_cam_display, player_cam_display } = req.body;

  console.log(`Starting streaming to ${whip_server_url}`, room);

  if (streamingRoom) {
    res.status(401).json({ message: 'Already streaming', room: streamingRoom });
    return;
  }

  whipServerUrl = whip_server_url;

  try {
    await axios.post(`${whipServerUrl}/create`, {
      id: `${room}board`,
      room: room,
      label: board_cam_display,
    });

    await axios.post(`${whipServerUrl}/create`, {
      id: `${room}player`,
      room: room,
      label: player_cam_display,
    });

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
      { shell: true, detached: true }
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
      { shell: true, detached: true }
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

app.get('/stop', async (req: Request, res: Response) => {
  if (!whipServerUrl || !streamingRoom) {
    res.status(500).json();
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

app.get('/status', (req: Request, res: Response) => {
  res.json({ room: streamingRoom });
});

app.get('/scan-wifi', (req: Request, res: Response) => {
  getWirelessInterfaces((error, interfaces) => {
    if (error || (interfaces && interfaces.length === 0)) {
      res.status(500).json({ message: 'No wireless interfaces found or error occurred.' });
      return;
    } else if (interfaces) {
      const wirelessInterface = interfaces[0];
      scanWifiNetworks(wirelessInterface, (error, networks) => {
        if (error) {
          res.status(500).json({ message: 'Failed to scan networks.' });
        } else {
          res.json({ networks });
        }
      });
    }
  });
});

const PORT = 8070;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

interface Network {
  ssid: string | null;
  quality: string | null;
  signalLevel: number | null;
  bssid: string | null;
}

function getWirelessInterfaces(callback: (error: Error | null, interfaces?: string[]) => void): void {
  exec("iw dev | awk '/Interface/ {print $2}'", (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      callback(error);
      return;
    }
    const interfaces = stdout.split('\n').filter((line) => line.trim() !== '');
    callback(null, interfaces);
  });
}

function scanWifiNetworks(interfaceName: string, callback: (error: Error | null, networks?: Network[]) => void): void {
  exec(`sudo iwlist ${interfaceName} scanning`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      callback(error);
      return;
    }

    const networks: Network[] = stdout
      .split('Cell')
      .slice(1)
      .map((cell) => {
        const ssidMatch = cell.match(/ESSID:"([^"]+)"/);
        const qualityMatch = cell.match(/Quality=([^ ]+) /);
        const signalMatch = cell.match(/Signal level=(-?\d+)/);
        const addressMatch = cell.match(/Address: ([\w:]+)/);

        return {
          ssid: ssidMatch ? ssidMatch[1] : null,
          quality: qualityMatch ? qualityMatch[1] : null,
          signalLevel: signalMatch ? parseInt(signalMatch[1], 10) : null,
          bssid: addressMatch ? addressMatch[1] : null,
        };
      })
      .filter((net) => net.ssid && net.bssid);

    const uniqueNetworks = networks.reduce((acc: Network[], network) => {
      const existing = acc.find((net) => net.ssid === network.ssid);
      if (!existing) {
        acc.push(network);
      } else if (existing.signalLevel && network.signalLevel && existing.signalLevel < network.signalLevel) {
        acc = acc.filter((net) => net.ssid !== network.ssid);
        acc.push(network);
      }
      return acc;
    }, []);

    callback(null, uniqueNetworks);
  });
}
