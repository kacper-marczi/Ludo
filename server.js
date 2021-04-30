const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser')
const Player = require('./src/Player')
const Room = require('./src/Room')
const EntityManager = require('./src/EntityManager')
const Dice = require('./src/Dice')
const Game = require('./src/Game')
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static('static'));

const rooms = []

const entityManager = new EntityManager()
const dice = new Dice()
const game = new Game()

app.get('/', (req, res) => {
    const id = req.cookies.id
    if (id != undefined) {
        return res.sendFile(path.join(__dirname + '/static/html/game.html'))
    }
    res.redirect('/login')
})

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname + '/static/html/login.html'))
})

app.post('/login', (req, res) => {
    if (req.cookies.id != undefined) {
        return res.redirect('/')
    }

    let room = entityManager.findNotEmptyRoom(rooms)

    if (room == false) {
        room = new Room()
        rooms.push(room)
    }

    const player = new Player(req.body.nick, uuidv4(), room.giveColor())
    room.addPlayerToRoom(player)

    res.cookie('id', player.id, {
        maxAge: 1000 * 60 * 60 * 4
    })

    game.addPawns(player)
    res.redirect('/')
})

app.get('/rollTheDice', (req, res) => {
    const id = req.cookies.id

    if (!entityManager.findRoomById(rooms, id).active) return res.end()
    if (id != entityManager.findActivePlayer(rooms, id).id) return res.end()

    let player = entityManager.findPlayerById(rooms, id)
    if (player.roll.expires > Date.now()) return res.end()

    const rolls = dice.generateDiceSequence()

    player.roll = {
        value: rolls[dice.rolls - 1],
        time: Date.now(),
        expires: 0
    }

    let room = entityManager.findRoomById(rooms, id),
        timeLeft = Math.floor(((1000 * room.turnTime) - (Date.now() - room.turnStart)) / 1000),
        pawnMoves = game.retrievePawnsThatCanMove(player, rolls[dice.rolls - 1])

    if (game.checkIfMovesAreEmpty(pawnMoves)) {
        player.roll.expires = player.roll.time + (dice.rolls * 180)
        setTimeout(() => {
            room.clearGameInterval()
        }, dice.rolls * 180)
    } else {
        player.roll.expires = player.roll.time + timeLeft * 1000 + 1000
    }

    res.send(JSON.stringify({
        rolls: rolls,
        pawnMoves: pawnMoves,
        color: player.color
    }))
})

app.get('/getUpdates', (req, res) => {
    const id = req.cookies.id

    let currentPlayers = entityManager.findPlayersInRoomByPlayerId(rooms, id)
    let room = entityManager.findRoomById(rooms, id)
    let state = false
    let activePlayer = {}
    let timeLeft = 10
    let pawns = {}
    let finished = false
    let winner = undefined

    if (room != undefined) {
        state = room.active
        finished = room.finished
        winner = room.winner
        timeLeft = Math.floor(((1000 * room.turnTime) - (Date.now() - room.turnStart)) / 1000)
        let player = entityManager.findActivePlayer(rooms, id)

        if (player != undefined) {
            activePlayer = {
                nick: player.nick,
                id: player.id,
                roll: player.roll
            }
        }
        pawns = room.retrieveAllPawns()
    }

    res.send(JSON.stringify({
        players: currentPlayers,
        room: {
            state: state,
            activePlayer: activePlayer,
            timeLeft: timeLeft,
            finished: finished,
            winner: winner
        },
        pawns: {
            currentPositions: pawns
        }
    }))
    res.end()
})

app.post('/changeReady', (req, res) => {
    const player = entityManager.findPlayerById(rooms, req.cookies.id)
    player.ready = req.body.state

    if (entityManager.findIfGameCanStart(rooms, req.cookies.id)) {
        let room = entityManager.findRoomById(rooms, req.cookies.id)
        room.startGame()
    }

    res.end()
})

app.post('/move', (req, res) => {
    const id = req.cookies.id
    if (id != entityManager.findActivePlayer(rooms, id).id) return res.end()
    const i = req.body.i

    const player = entityManager.findPlayerById(rooms, id)
    const room = entityManager.findRoomById(rooms, id)
    const moves = game.retrievePawnsThatCanMove(player, player.roll.value)

    let pawn = player.pawns[i]
    pawn.moveSelf(moves[i])
    player.roll.expires = Date.now()
    room.clearGameInterval()
    game.killAllPawnsOnTile(pawn, room, player.color)
    game.checkIfPlayerWon(player, room)
    res.end()
})

app.listen(PORT, () => {
    console.log(`Listening at http://localhost:${PORT}`);
});
