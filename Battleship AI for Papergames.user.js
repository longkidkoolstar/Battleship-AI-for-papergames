// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      0.5
// @description  An enhanced AI for playing Battleship on papergames.io with strategic moves and console logging
// @author       longkidkoolstar
// @match        https://papergames.io/*
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(function() {
    'use strict';

    let huntMode = true;
    let lastHit = null;
    let lastHitDirection = null;
    let consecutiveHits = 0;
    let potentialTargets = [];


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
            consecutiveHits++;  // Increment the count of consecutive hits

            // Determine last hit direction
            let [row, col] = cell.className.match(/\d+/g).map(Number);
            if (lastHitDirection) {
                // Check if we can continue in that direction
                let nextCell;
                if (lastHitDirection === 'down') {
                    nextCell = document.querySelector(`td.cell-${row + 1}-${col}.null`);
                } else if (lastHitDirection === 'up') {
                    nextCell = document.querySelector(`td.cell-${row - 1}-${col}.null`);
                } else if (lastHitDirection === 'right') {
                    nextCell = document.querySelector(`td.cell-${row}-${col + 1}.null`);
                } else if (lastHitDirection === 'left') {
                    nextCell = document.querySelector(`td.cell-${row}-${col - 1}.null`);
                }
                if (nextCell) {
                    potentialTargets.push(nextCell);  // Add next cell to potential targets
                }
            }
            
            // Set lastHitDirection based on the most recent hits
            if (consecutiveHits > 1) {
                // Avoid moving in the opposite direction after two hits
                if (lastHitDirection === 'up' || lastHitDirection === 'down') {
                    lastHitDirection = lastHitDirection === 'up' ? 'down' : 'up';
                } else {
                    lastHitDirection = lastHitDirection === 'left' ? 'right' : 'left';
                }
            }
            
            if (potentialTargets.length > 0) {
                console.log('Potential targets found. Targeting adjacent cells.');
            } else {
                console.log('No adjacent cells available to target. Staying in Target Mode.');
            }
        } else {
            console.log('Attack missed.');
            if (lastHit) {
                // Reset consecutive hit count on a miss
                consecutiveHits = 0;

                // Check which direction to go based on the last hit direction
                switch (lastHitDirection) {
                    case 'down':
                        console.log('Missed! Moving up to the last hit.');
                        lastHitDirection = 'up';  // Change direction to up
                        break;
                    case 'up':
                        console.log('Missed! Moving down to the last hit.');
                        lastHitDirection = 'down'; // Change direction to down
                        break;
                    case 'left':
                        console.log('Missed! Moving right to the last hit.');
                        lastHitDirection = 'right'; // Change direction to right
                        break;
                    case 'right':
                        console.log('Missed! Moving left to the last hit.');
                        lastHitDirection = 'left'; // Change direction to left
                        break;
                }
            }
        }

        // Check if the ship is sunk
        if (cell.querySelector('.skull')) {
            console.log('Ship sunk!');
            // Resetting states after a ship is sunk
            lastHit = null;
            potentialTargets = [];
            lastHitDirection = null; // Reset direction
            consecutiveHits = 0; // Reset consecutive hits
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

    let lastAttackTime = 0; // Track the last attack time

    // Function to check if the game is in a ready state for an attack
    function isGameReady() {
        let opponentBoard = document.querySelector('#board_userAI');  // Opponent's board ID
        return opponentBoard && !opponentBoard.classList.contains('inactive'); // Adjust the class as per game state
    }
    
// Function to introduce a delay in milliseconds
function waitForAttack(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}


// Adjusted performAttack to add a 2-second delay and check board state
async function performAttack(currentElementValue) {
    const now = Date.now();
    
    // Check if enough time has passed since the last attack (2 seconds)
    if (now - lastAttackTime < 2000) {
        console.log("Waiting for 2 seconds before the next attack.");
        return;
    }
    
    // Only perform an attack if the game is ready
    if (!isGameReady()) {
        console.log("Game is not ready. Waiting...");
        return;
    }

    console.log('Performing attack based on current element value:', currentElementValue);

    // Wait 2 seconds before the next attack
    await waitForAttack(2000);

    // Select cell to attack based on hunt or target mode
    let cell = huntMode ? huntModeAttack() : targetModeAttack();
    if (cell) {
        attackCell(cell);
        lastAttackTime = now; // Update the last attack time
    } else {
        console.log("No cell available to attack.");
    }
}
    

    GM.getValue('username').then(function(username) {
        if (!username) {
            username = prompt('Please enter your Papergames username:');
            GM.setValue('username', username);
        }
    });

// Update the updateBoard function to maintain interval control
function updateBoard() {
    var prevChronometerValue = '';
    GM.getValue("username").then(function(username) {
        var profileOpener = [...document.querySelectorAll(".text-truncate.cursor-pointer")].find(
            opener => opener.textContent.trim() === username
        );

        var chronometer = document.querySelector("app-chronometer");
        var numberElement = profileOpener.parentNode ? profileOpener.parentNode.querySelectorAll("span")[4] : null;
        var profileOpenerParent = profileOpener.parentNode ? profileOpener.parentNode.parentNode : null;

        var currentElement = chronometer || numberElement;
        console.log("Current Element:", currentElement);

        if (currentElement && currentElement.textContent !== prevChronometerValue && profileOpener) {
            prevChronometerValue = currentElement.textContent;
            performAttack(currentElement.textContent);
        } else {
            console.log("No valid element found for timing.");
        }
    });
}

// Set interval to update the board regularly
setInterval(updateBoard, 1000); // Check every second
})();
