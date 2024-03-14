import express, { Request, Response } from 'express';
import axios from 'axios';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

interface Network {
  ssid: string | null;
  quality: string | null;
  signalLevel: number | null;
  bssid: string | null;
}

type CamType = 'board' | 'player';

type VideoDevice = 'video0' | 'video1';

let janusEndpoint: string | null = null;
let streamingRoom: string | null = null;

let displays: { board: string; player: string } = {
  board: null,
  player: null,
};
let commands: { board: ChildProcessWithoutNullStreams | null; player: ChildProcessWithoutNullStreams | null } = {
  board: null,
  player: null,
};
let stoppingCommands: { board: boolean; player: boolean } = {
  board: false,
  player: false,
};

let camTypes: CamType[] = ['board', 'player'];

interface StartRequestBody {
  janus_endpoint: string;
  room: string;
  board_cam_display: string;
  player_cam_display: string;
}

app.post('/start', async (req: Request<{}, {}, StartRequestBody>, res: Response) => {
  const { janus_endpoint, room, board_cam_display, player_cam_display } = req.body;

  console.log(`Starting streaming to ${janus_endpoint}`, room);

  if (streamingRoom) {
    res.status(401).json({ message: 'Already streaming', room: streamingRoom });
    return;
  }

  janusEndpoint = janus_endpoint;
  streamingRoom = room;

  displays['board'] = board_cam_display;
  displays['player'] = player_cam_display;

  startClient('board', 'video0', 1);
  startClient('player', 'video1', 2);

  res.status(200).json();
});

app.get('/stop', async (req: Request, res: Response) => {
  if (!janusEndpoint || !streamingRoom) {
    res.status(500).json();
    return;
  }

  for (let camType of camTypes) {
    await stopClient(camType);
  }

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

function startClient(type: CamType, device: VideoDevice, ssrc: number) {
  if (!janusEndpoint || !streamingRoom) {
    return;
  }

  if (commands[type]) {
    console.log(`Stopping existing ${type} cam process`);
    stoppingCommands[type] = true;
    commands[type].kill();
  }

  commands[type] = spawn(
    `gst-launch-1.0 v4l2src device=/dev/${device} ! video/x-raw,width=960,height=720,framerate=30/1 ! videoconvert ! queue ! x264enc tune=zerolatency bitrate=1500 speed-preset=ultrafast ! rtph264pay config-interval=5 pt=96 ssrc=${ssrc} ! queue ! application/x-rtp,media=video,encoding-name=H264,payload=96 ! janusvrwebrtcsink signaller::janus-endpoint=${janusEndpoint} signaller::room-id=${streamingRoom} signaller::display-name=${displays[type]}`,
    {
      shell: true,
      detached: true,
    }
  );
  commands[type].stdout.on('data', (data) => {
    console.log(`[${type}]: ${data}`);
  });
  commands[type].stderr.on('data', (data) => {
    console.error(`[${type}]: ${data}`);
  });
  commands[type].on('close', (code) => {
    if (!stoppingCommands[type]) {
      console.error(`Process for ${type} cam closed unexpectedly`);
      commands[type] = null;
      setTimeout(async () => {
        startClient(type, device, ssrc);
      }, 3000);
    }
    stoppingCommands[type] = false;
    console.log(`Process for ${type} cam exited with code ${code}`);
  });
}

async function stopClient(type: CamType) {
  if (commands[type]) {
    stoppingCommands[type] = true;

    console.log(`Stopping ${type} cam process`);
    commands[type].kill();
    commands[type] = null;
  } else {
    console.error(`No ${type} cam process`);
  }

  await axios.delete(`${janusEndpoint}/endpoint/${streamingRoom}${type}`);
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
