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

let diceNumber = 0;


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

        // we save this number to determine possible moves in phase MOVE
        diceNumber = randomNumber;

        io.to("board").emit("draw", {
            number: randomNumber,
        });

        // make decision if player looses his turn
        if (![1,6].includes(randomNumber) 
            && !player.pawns.find(pawn => pawn.location != LOCATION_BASE && pawn.fieldsLeft >= randomNumber)
        ) { // player looses turn
            nextPlayer();
        } else { // player can pick a pawn
            phase = PHASE_MOVE;
        }
    }
}

function pawnClick (player, pawn) {
    if (phase != PHASE_MOVE)
        return false;

    if (players.findIndex(p => p.uuid == player.uuid) + 1 != currentPlayerId)
        return false;
    
    if (pawn.location == LOCATION_BASE) {
        if (diceNumber != 1 && diceNumber != 6)
            return false;

        pawn.location = LOCATION_BOARD;
        pawn.position = 1 + currentPlayerId * 10 - 10;
        pawn.fieldsLeft = 43;
        pawn.shift = currentPlayerId * 10 - 10;
    } else {
        // If there are not enough fields left for this pawn
        if (pawn.fieldsLeft < diceNumber)
            return false;

        if (getPawns(LOCATION_HOME, {player: player}).filter(p => p.number != pawn.number && p.position > pawn.position).length) {
            // If another pawn is in home and blocks enterance 
            if (pawn.fieldsLeft - diceNumber < 4 &&
                4 - (pawn.fieldsLeft - diceNumber) >= getPawns(LOCATION_HOME, {player: player})
                                                .filter(p => p.number != pawn.number && p.position > pawn.position)
                                                .sort((a,b) => a.position - b.position)[0].position
                )
                return false;
        }

        pawn.fieldsLeft -= diceNumber;

        var inHome = getPawns(LOCATION_HOME, {player: player});

        if (pawn.fieldsLeft < 4 - inHome.length) {
            if (pawn.location == LOCATION_BOARD) {
                // pawn goes home!
                pawn.location = LOCATION_HOME;

                getPawns(LOCATION_BOARD, {player: player}).filter(p => p.number != pawn.number).forEach(p => p.fieldsLeft--);
                getPawns(LOCATION_BASE, {player: player}).filter(p => p.number != pawn.number).forEach(p => p.fieldsLeft--);
            }

            pawn.position = 4 - pawn.fieldsLeft;
        } else {
            pawn.position += diceNumber;
        }
    }

    if (pawn.position > 40)
        pawn.position -= 40; // TODO: figure out if this really works 

    // beating is only possible on board    
    if (pawn.location == LOCATION_BOARD) {
        // Get pawns already on this field
        var pawns = getPawns(pawn.location, {position: pawn.position});
        
        if (pawns.length == 2) {
            if (pawns[0].playerId != pawns[1].playerId) {
                var theOtherPawn = pawns.find(p => p.playerId != pawn.playerId);
                // console.log("theOtherPawn:", theOtherPawn);
                theOtherPawn.position = [1,2,3,4].filter(i => !getPawns(LOCATION_BASE, {player: getPlayer(theOtherPawn.playerId)}).flatMap(p => p.position).includes(i))[0];
                theOtherPawn.location = LOCATION_BASE;
    
                updatePawns(theOtherPawn.playerId);
            }
        }
    }

    updatePawns(players.findIndex(p => p.uuid == player.uuid) + 1);

    nextPlayer();
}

function getPawns (location, {position = undefined, player = undefined}) {
    var pawns = [];

    (player ? [player] : players)
    .forEach(player => {
        player.pawns.forEach(pawn => {
            if (pawn.location == location && (pawn.position == position || position == undefined))
                pawns.push(pawn);
        });
    });

    return pawns;
}

function updatePawns (playerId) {
    io.to("board").emit("updatePawns", {
        playerUuid: getPlayer(playerId).uuid,
        pawns: getPlayer(playerId).pawns,
    });
}

io.on('connection', (socket) => {
    socket.join('board');
    
    socket.on('onBoard', (player) => {
        var existing = players.find(p => {
            return p.uuid == player.uuid;
        });

        if (!existing) {
            // Create new player in this board's memory
            // player.socket = socket;
            var playerId = players.length + 1;

            player.pawns = [];
            player.readyToPlay = false;
            players.push(player);

            socket.player = player;
        } else {
            existing.socket = socket;
        }

        if (players.length >= 2)
            io.to("board").emit("enoughPlayers", {});

        console.log('Socket ' + socket.id + ' is player uuid ' + player.uuid + ' (name: ' + player.name + ')');

        socket.on('readyToPlay', (playerRaw) => {
            console.log("Socket " + socket.id + " player is ready to play uuid " + playerRaw.uuid)
            // substitute raw player with player model from players[]
            player = getPlayer(playerId);
            player.readyToPlay = true;

            for (var i = 1; i <= 4; i++) {
                player.pawns.push({
                    number: i,
                    location: LOCATION_BASE,
                    position: i,
                    fieldsLeft: 43,
                    playerId: playerId,
                });
            }

            // players.forEach((player,index) => {
            //     // socket.emit("playerReady", player);
            //     updatePawns(index + 1);
            // });

            
            io.to("board").emit("playerReady", player);
            updatePawns(playerId);

            if (players.filter(p => p.readyToPlay).length == players.length)
                startGame();
        });


        socket.on('pawnClick', (pawn) => {
            if (socket.player.uuid != pawn.playerUuid)
                return;

            pawnClick(getPlayerByUuid(socket.player.uuid), player.pawns.find(p => p.number == pawn.number));
        })

        socket.on('diceClick', () => {
            diceClick(getPlayerByUuid(socket.player.uuid));
        });
    });
});
