import {Server as httpServer} from 'http';
import express from 'express';
import {Server as socketio} from 'socket.io';

let app = express();
let server = httpServer(app);
server.listen(8081);
let io = new socketio(server, {
    cors: {
        origin: "*"
    }
});

app.get('/', (req, res) => {
    res.send("Hello world");
});

const PHASE_DRAW = 0;
const PHASE_MOVE = 1;

let players = [];

let currentPlayerId = 0;

// currently played phase
let phase = PHASE_DRAW;

function getPlayer (id) {
    return players[id - 1];
}

function startGame() {
    io.to("board").emit("gameStart");

    var startPlayer = Math.floor(Math.random() * 4 + 1); 

    currentPlayerId = startPlayer;
    io.to("board").emit("playerTurn", {
        id: getPlayer(currentPlayerId).id,
        name: getPlayer(currentPlayerId).name,
    });
}

function diceClick (playerId) {

}

function pawnClick (playerId, pawn) {

}

io.on('connection', (socket) => {
    console.log('Player connected - socket ' + socket.id);
    
    socket.on('readyToPlay', (player) => {
        var existing = players.find(p => {
            return p.uuid == player.uuid;
        });

        socket.join('board');

        if (!existing) {
            player.socket = socket;
            players.push(player);
        } else {
            existing.socket = socket;
        }

        console.log('Socket ' + socket.id, player);

        socket.on('pawnClick', (pawn) => {
            console.log('pawnClick', pawn);
        })

        socket.on('diceClick', () => {
            console.log('diceClick');
        });

        if (players.length == 4)
            startGame();
    });
});
