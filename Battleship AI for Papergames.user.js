// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      0.1
// @description  A simple AI for playing Battleship on papergames.io
// @author       longkidkoolstar
// @match        https://papergames.io/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Helper function to get a random cell on the opponent's board
    function getRandomCell() {
        let opponentBoard = document.querySelector('#board_userAI'); // Opponent's board ID
        let cells = opponentBoard.querySelectorAll('td.null'); // Unhit cells
        if (cells.length === 0) {
            console.log('No available cells to attack');
            return null;
        }
        let randomIndex = Math.floor(Math.random() * cells.length);
        return cells[randomIndex];
    }

    // Simulate a click on a random cell
    function attackRandomCell() {
        let cell = getRandomCell();
        if (cell) {
            cell.click();
            console.log('Attacked cell:', cell);
        }
    }

    // Continuously attack the opponent's board every few seconds
    setInterval(() => {
        attackRandomCell();
    }, 3000); // Adjust time interval between attacks
})();
