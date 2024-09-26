// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      0.1
// @description  An enhanced AI for playing Battleship on papergames.io with strategic moves and console logging
// @author       longkidkoolstar
// @match        https://papergames.io/*
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(function() {
    'use strict';

    let huntMode = true;  // AI starts in Hunt Mode
    let lastHit = null;   // The last successful hit
    let potentialTargets = [];  // Potential targets around the last hit

    // Helper function to get all unhit cells
    function getAvailableCells() {
        let opponentBoard = document.querySelector('#board_userAI'); // Opponent's board ID
        let cells = opponentBoard.querySelectorAll('td.null'); // Unhit cells
        return Array.from(cells); // Convert NodeList to array for easier manipulation
    }

    // Function to generate adjacent cells around a hit cell
    function getAdjacentCells(cell) {
        let cellClass = cell.className;
        let [row, col] = cellClass.match(/\d+/g).map(Number);  // Extract row and col from class name

        let adjacentCells = [
            document.querySelector(`td.cell-${row-1}-${col}.null`), // Top
            document.querySelector(`td.cell-${row+1}-${col}.null`), // Bottom
            document.querySelector(`td.cell-${row}-${col-1}.null`), // Left
            document.querySelector(`td.cell-${row}-${col+1}.null`), // Right
        ];

        // Filter out invalid or null cells
        return adjacentCells.filter(c => c);
    }

    // Function to handle hunting mode (random moves)
    function huntModeAttack() {
        let cells = getAvailableCells();
        if (cells.length === 0) {
            console.log('No available cells to attack');
            return null;
        }

        // Prioritize edge cells for higher hit probability
        let edgeCells = cells.filter(cell => {
            let cellClass = cell.className;
            let [row, col] = cellClass.match(/\d+/g).map(Number);
            return (row === 0 || row === 9 || col === 0 || col === 9);
        });

        // If there are edge cells, prioritize them, otherwise attack a random cell
        let targetCells = edgeCells.length > 0 ? edgeCells : cells;
        let randomIndex = Math.floor(Math.random() * targetCells.length);
        return targetCells[randomIndex];
    }

    // Function to handle targeting mode (focused attacks around a hit)
    function targetModeAttack() {
        if (potentialTargets.length > 0) {
            console.log("AI is in Target Mode. Attacking potential target...");
            return potentialTargets.pop();  // Attack one of the potential adjacent cells
        } else {
            console.log("No more potential targets around the last hit. Switching back to Hunt Mode.");
            huntMode = true;  // Switch back to Hunt Mode
            return huntModeAttack();
        }
    }

    // Function to check if the hit was successful and transition to Target Mode
    function handleAttackResult(cell) {
        if (cell.querySelector('.hit')) {  // Check if the cell has been marked as hit
            console.log('Hit confirmed on cell:', cell);
            if (huntMode) {
                console.log('Switching from Hunt Mode to Target Mode.');
                huntMode = false;  // Switch to target mode
            }
            lastHit = cell;    // Store the last hit cell
            potentialTargets = getAdjacentCells(cell);  // Get adjacent cells to target
            if (potentialTargets.length > 0) {
                console.log('Potential targets found. Targeting adjacent cells.');
            } else {
                console.log('No adjacent cells available to target. Staying in Target Mode.');
            }
        } else {
            console.log('Attack missed.');
        }
    }

    // Function to simulate a click on a cell and handle results
    function attackCell(cell) {
        if (cell) {
            cell.click();  // Simulate clicking the cell
            console.log('Attacked cell:', cell);

            // After attack, check if it was a hit
            setTimeout(() => handleAttackResult(cell), 1000);  // Slight delay to allow DOM to update
        }
    }

    // Main attack function that determines whether to hunt or target
    function performAttack() {
        if (huntMode) {
            console.log("AI is in Hunt Mode. Attacking randomly...");
        }
        let cell = huntMode ? huntModeAttack() : targetModeAttack();
        attackCell(cell);
    }

    // Check if username is stored in GM storage and prompt if not
    GM.getValue('username').then(function(username) {
        if (!username) {
            // Alert the user
            alert('Username is not stored in GM storage.');

            // Prompt the user to enter the username
            username = prompt('Please enter your Papergames username (case-sensitive):');

            // Save the username to GM storage
            GM.setValue('username', username);
        }
    });

    var prevChronometerValue = null;

    // Function to check the board status and trigger the attack if it's the AI's turn
    function updateBoard() {
        GM.getValue("username").then(function(username) {
            var profileOpeners = document.querySelectorAll(".text-truncate.cursor-pointer");
            var profileOpener = null;

            // Find the element containing the user's profile
            profileOpeners.forEach(function(opener) {
                if (opener.textContent.trim() === username) {
                    profileOpener = opener;
                }
            });

            if (!profileOpener) {
                console.error("Profile opener not found");
                return;
            }

            // Check the chronometer (AI's timer)
            var chronometer = document.querySelector("app-chronometer");
            var numberElement = profileOpener.parentNode ? profileOpener.parentNode.querySelectorAll("span")[4] : null;
            var currentElement = chronometer || numberElement;

            // Trigger attack when it's AI's turn
            if (currentElement && currentElement.textContent !== prevChronometerValue) {
                prevChronometerValue = currentElement.textContent;
                console.log("It's AI's turn, the time: ", currentElement.textContent);
                setTimeout(performAttack, 2000);  // Delay attack to mimic human reaction time
            } else {
                console.log("Waiting for AI's turn...");
            }
        });
    }

    // Periodically check if it's AI's turn and update the board
    setInterval(() => {
        updateBoard();
    }, 3000); // Check every 3 seconds
})();
