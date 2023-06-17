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

const LOCATION_BASE = 'inBase';
const LOCATION_HOME = 'inHome';
const LOCATION_BOARD = 'inBoard';

let players = [];

let currentPlayerId = 0;

// currently played phase
let phase = PHASE_DRAW;

function getPlayer (id) {
    return players[id - 1];
}


/**
 * changes to next player's turn and resets phase to DRAW.
 * 
 * @date 2023-06-17
 * @returns {any}
 */
function nextPlayer () {
    if (currentPlayerId == players.length)
        currentPlayerId = 1;
    else 
        currentPlayerId++;

    phase = PHASE_DRAW;

    playerTurn(currentPlayerId);
}

/**
 * Emits information about who's turn is it
 * 
 * @date 2023-06-17
 * @param {any} playerId
 * @returns {any}
 */
function playerTurn (playerId) {
    io.to("board").emit("playerTurn", {
        uuid: getPlayer(playerId).uuid,
        name: getPlayer(playerId).name,
    });
}

/**
 * Gets Player of a given uuid. If player is not found, returns false.
 * 
 * @date 2023-06-17
 * @param {String} uuid - uuid of a Player
 * @returns {Player}
 */
function getPlayerByUuid (uuid) {
    return players.find(p => p.uuid == uuid);
}

function startGame() {
    io.to("board").emit("gameStart");

    currentPlayerId = Math.floor(Math.random() * (players.length) + 1); 

    playerTurn(currentPlayerId);
}

function diceClick (player) {
    if (players.findIndex(p => p.uuid == player.uuid) + 1 == currentPlayerId && phase == PHASE_DRAW) {
        var randomNumber = Math.floor(Math.random() * 6 + 1);

        io.to("board").emit("draw", {
            number: randomNumber,
        });

        // make decision if player looses his turn
        if (![1,6].includes(randomNumber) 
            && !player.pawns.find(pawn => pawn.location != LOCATION_BASE && pawn.fieldsLeft > 0)
        ) { // player looses turn
            nextPlayer();
        } else { // player can pick a pawn
            phase = PHASE_MOVE;
        }
    }
}

function pawnClick (player, pawn) {

}

function updatePawns (playerId) {
    console.log(getPlayer(playerId).pawns);

    io.to("board").emit("updatePawns", {
        playerUuid: getPlayer(playerId).uuid,
        pawns: getPlayer(playerId).pawns,
    });
}

io.on('connection', (socket) => {
    console.log('Player connected - socket ' + socket.id);
    
    socket.on('readyToPlay', (player) => {
        var existing = players.find(p => {
            return p.uuid == player.uuid;
        });

        socket.join('board');

        if (!existing) {
            // Create new player in this board's memory
            // player.socket = socket;
            player.pawns = [];
            for (var i = 1; i <= 4; i++) {
                player.pawns.push({
                    number: i,
                    location: LOCATION_BASE,
                    position: i,
                    fieldsLeft: 43,
                });
            }
            players.push(player);

            io.to("board").emit("playerReady", player);

            socket.player = player;

            updatePawns(players.length);
        } else {
            existing.socket = socket;
        }

        console.log('Socket ' + socket.id, player);

        socket.on('pawnClick', (pawn) => {
            console.log('pawnClick', pawn);
            pawnClick(getPlayerByUuid(socket.player.uuid), pawn);
        })

        socket.on('diceClick', () => {
            console.log('diceClick');
            diceClick(getPlayerByUuid(socket.player.uuid));
        });

        // if (players.length == 4)
            startGame();
    });
});
