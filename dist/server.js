var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import express from 'express';
import axios from 'axios';
import { exec, spawn } from 'child_process';
import cors from 'cors';
const app = express();
app.use(express.json());
app.use(cors());
let whipServerUrl = null;
let streamingRoom = null;
let commands = {
    board: null,
    player: null,
};
let stoppingCommands = {
    board: false,
    player: false,
};
app.post('/start', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { whip_server_url, room, board_cam_display, player_cam_display } = req.body;
    console.log(`Starting streaming to ${whip_server_url}`, room);
    if (streamingRoom) {
        res.status(401).json({ message: 'Already streaming', room: streamingRoom });
        return;
    }
    whipServerUrl = whip_server_url;
    try {
        yield axios.post(`${whipServerUrl}/create`, {
            id: `${room}board`,
            room: room,
            label: board_cam_display,
        });
        yield axios.post(`${whipServerUrl}/create`, {
            id: `${room}player`,
            room: room,
            label: player_cam_display,
        });
        streamingRoom = room;
        startClient('board', 'video0', 1);
        startClient('player', 'video1', 2);
        res.status(200).json();
    }
    catch (error) {
        console.error('Error making POST requests or running commands:', error);
        res.status(500).json({ message: 'An error occurred' });
    }
}));
app.get('/stop', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!whipServerUrl || !streamingRoom) {
        res.status(500).json();
        return;
    }
    if (commands['board']) {
        stoppingCommands['board'] = true;
        console.log(`Stopping board cam process`);
        commands['board'].kill();
        commands['board'] = null;
    }
    else {
        console.error(`No board cam process`);
    }
    yield axios.delete(`${whipServerUrl}/endpoint/${streamingRoom}board`);
    if (commands['player']) {
        stoppingCommands['player'] = true;
        console.log(`Stopping player cam process`);
        commands['player'].kill();
        commands['player'] = null;
    }
    else {
        console.error(`No player cam process`);
    }
    yield axios.delete(`${whipServerUrl}/endpoint/${streamingRoom}player`);
    streamingRoom = null;
    res.status(200).json();
}));
app.get('/status', (req, res) => {
    res.json({ room: streamingRoom });
});
app.get('/scan-wifi', (req, res) => {
    getWirelessInterfaces((error, interfaces) => {
        if (error || (interfaces && interfaces.length === 0)) {
            res.status(500).json({ message: 'No wireless interfaces found or error occurred.' });
            return;
        }
        else if (interfaces) {
            const wirelessInterface = interfaces[0];
            scanWifiNetworks(wirelessInterface, (error, networks) => {
                if (error) {
                    res.status(500).json({ message: 'Failed to scan networks.' });
                }
                else {
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
function startClient(type, device, ssrc) {
    if (!whipServerUrl || !streamingRoom) {
        return;
    }
    if (commands[type]) {
        console.log(`Stopping existing board cam process`);
        stoppingCommands[type] = true;
        commands[type].kill();
    }
    commands[type] = spawn('./simple-whip-client/whip-client', [
        '-u',
        `${whipServerUrl}/endpoint/${streamingRoom}${type}`,
        '-V',
        `"v4l2src device=/dev/${device} ! video/x-raw,width=960,height=720,framerate=30/1 ! videoconvert ! queue ! x264enc tune=zerolatency bitrate=1500 speed-preset=ultrafast ! rtph264pay config-interval=5 pt=96 ssrc=${ssrc} ! queue ! application/x-rtp,media=video,encoding-name=H264,payload=96"`,
    ], {
        shell: true,
        detached: true,
    });
    commands[type].stdout.on('data', (data) => {
        console.log(`[BOARD]: ${data}`);
    });
    commands[type].stderr.on('data', (data) => {
        console.error(`[BOARD]: ${data}`);
    });
    commands[type].on('close', (code) => {
        if (!stoppingCommands[type]) {
            console.error(`Board cam closed unexpectedly`);
            commands[type] = null;
            setTimeout(() => {
                startClient(type, device, ssrc);
            }, 3000);
        }
        stoppingCommands[type] = false;
        console.log(`Board cam process exited with code ${code}`);
    });
}
function getWirelessInterfaces(callback) {
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
function scanWifiNetworks(interfaceName, callback) {
    exec(`sudo iwlist ${interfaceName} scanning`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            callback(error);
            return;
        }
        const networks = stdout
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
        const uniqueNetworks = networks.reduce((acc, network) => {
            const existing = acc.find((net) => net.ssid === network.ssid);
            if (!existing) {
                acc.push(network);
            }
            else if (existing.signalLevel && network.signalLevel && existing.signalLevel < network.signalLevel) {
                acc = acc.filter((net) => net.ssid !== network.ssid);
                acc.push(network);
            }
            return acc;
        }, []);
        callback(null, uniqueNetworks);
    });
}
