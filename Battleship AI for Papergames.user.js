// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      1.0.1
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
    let shipOrientation = null; // 'vertical', 'horizontal', or null
    let confirmedHits = []; // Store coordinates of confirmed hits
    let activeTargets = []; // Queue for high-priority cells to guess
    let orientation = null; // Track current ship orientation ('horizontal' or 'vertical')
    let lastTimerValue = null; // Add this at the top of your script with other global variables
    let lastCheckTime = 0; // Add this at the top with other global variables
    const CHECK_INTERVAL = 3000; // Milliseconds between checks

    // Function to analyze the current board state
    function analyzeBoardState() {
        const board = Array(10).fill().map(() => Array(10).fill('unknown'));
        
        // Specifically analyze the opponent's board
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) return board;
        
        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            const [row, col] = cell.className.match(/\d+/g).map(Number);
            
            // Check for previously tried cell (miss)
            if (cell.querySelector('svg.intersection.no-hit')) {
                board[row][col] = 'miss';
            }
            // Check for hit
            else if (cell.querySelector('.hit.fire')) {
                board[row][col] = 'hit';
            }
            // Check for destroyed ship
            else if (cell.querySelector('.magictime.opacityIn.ship-cell.circle-dark')) {
                board[row][col] = 'destroyed';
            }
            // Normal untried cell
            else if (cell.querySelector('svg.intersection:not(.no-hit)')) {
                board[row][col] = 'available';
            }
        });
        
        return board;
    }
    
    // Helper function to get all unhit cells with improved board analysis
    function getAvailableCells() {
        const cells = [];
        const board = analyzeBoardState();
        
        // Specifically target the opponent's board
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) {
            console.log('Cannot find opponent board');
            return [];
        }
        
        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            // Only consider cells that are null (untried) and have the basic intersection circle
            if (cell.classList.contains('null') && cell.querySelector('svg.intersection:not(.no-hit)')) {
                const [row, col] = cell.className.match(/\d+/g).map(Number);
                let score = calculateProbabilityScore(row, col, board);
                cells.push({ cell, score });
            }
        });
        
        // Sort cells by probability score
        return cells.sort((a, b) => b.score - a.score).map(item => item.cell);
    }
    
    // Calculate probability score for a cell based on surrounding patterns
    function calculateProbabilityScore(row, col, board) {
        let score = 1;
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1]  // up, down, left, right
        ];
        
        // Check for adjacent hits
        directions.forEach(([dx, dy]) => {
            const newRow = row + dx;
            const newCol = col + dy;
            
            if (newRow >= 0 && newRow < 10 && newCol >= 0 && newCol < 10) {
                if (board[newRow][newCol] === 'hit') {
                    score += 3;  // Higher probability near hits
                }
                if (board[newRow][newCol] === 'miss') {
                    score -= 1;  // Lower probability near misses
                }
            }
        });
        
        // Prefer cells that could fit ships
        let horizontalSpace = 0;
        let verticalSpace = 0;
        
        // Check horizontal space
        for (let i = -2; i <= 2; i++) {
            if (col + i >= 0 && col + i < 10 && 
                (board[row][col + i] === 'available' || board[row][col + i] === 'hit')) {
                horizontalSpace++;
            }
        }
        
        // Check vertical space
        for (let i = -2; i <= 2; i++) {
            if (row + i >= 0 && row + i < 10 && 
                (board[row + i][col] === 'available' || board[row + i][col] === 'hit')) {
                verticalSpace++;
            }
        }
        
        score += Math.max(horizontalSpace, verticalSpace);
        
        return score;
    }



// Modified handleAttackResult to track hits and determine orientation
function handleAttackResult(cell) {
    if (isHitWithSkull(cell)) {
        const hitCoord = {
            row: parseInt(cell.getAttribute('data-row')),
            col: parseInt(cell.getAttribute('data-col'))
        };
        confirmedHits.push(hitCoord);
        
        // Determine orientation if we have multiple hits
        if (confirmedHits.length >= 2) {
            shipOrientation = determineOrientation();
        }
        
        huntMode = false;
        lastHit = cell;
        
        // Get adjacent cells for targeting
        let adjacent = getAdjacentCells(cell);
        potentialTargets.push(...adjacent.filter(adjCell => 
            !isHitWithSkull(adjCell) && 
            !adjCell.querySelector('.miss')
        ));
        
        console.log('Added adjacent cells as potential targets:', potentialTargets);
    } else if (cell.querySelector('.miss')) {
        console.log('Miss on cell:', cell);
        
        // Check if we have 3 hits in a row and missed the fourth
        if (confirmedHits.length >= 3) {
            const lastThreeHits = confirmedHits.slice(-3);
            const orientation = determineOrientation(lastThreeHits);
            if (orientation) {
                shipOrientation = orientation;
                console.log('Following orientation:', shipOrientation);
            }
        }
    }
}

// Modified getAdjacentCells to strictly follow determined orientation
function getAdjacentCells(cell) {
    const row = parseInt(cell.getAttribute('data-row'));
    const col = parseInt(cell.getAttribute('data-col'));
    let adjacentCells = [];
    
    if (shipOrientation === 'vertical') {
        // Only add cells above and below
        adjacentCells.push(
            document.querySelector(`[data-row="${row-1}"][data-col="${col}"]`),
            document.querySelector(`[data-row="${row+1}"][data-col="${col}"]`)
        );
    } else if (shipOrientation === 'horizontal') {
        // Only add cells left and right
        adjacentCells.push(
            document.querySelector(`[data-row="${row}"][data-col="${col-1}"]`),
            document.querySelector(`[data-row="${row}"][data-col="${col+1}"]`)
        );
    } else {
        // No orientation determined yet, check all directions
        adjacentCells.push(
            document.querySelector(`[data-row="${row-1}"][data-col="${col}"]`),
            document.querySelector(`[data-row="${row+1}"][data-col="${col}"]`),
            document.querySelector(`[data-row="${row}"][data-col="${col-1}"]`),
            document.querySelector(`[data-row="${row}"][data-col="${col+1}"]`)
        );
    }
    
    // Filter out null cells and already attacked cells
    return adjacentCells.filter(cell => 
        cell && !cell.hasAttribute('data-result')
    );
}

// Function to determine orientation based on last three hits
function determineOrientation(lastThreeHits) {
    if (!lastThreeHits) {
        lastThreeHits = confirmedHits.slice(-3);
    }
    
    const sortedByRow = lastThreeHits.sort((a, b) => a.row - b.row);
    const sortedByCol = lastThreeHits.sort((a, b) => a.col - b.col);
    
    // Check if hits are in same column (vertical)
    if (sortedByCol[0].col === sortedByCol[1].col && sortedByCol[1].col === sortedByCol[2].col) {
        return 'vertical';
    }
    // Check if hits are in same row (horizontal)
    if (sortedByRow[0].row === sortedByRow[1].row && sortedByRow[1].row === sortedByRow[2].row) {
        return 'horizontal';
    }
    return null;
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

    // Function to check if a cell is a confirmed hit with skull
    function isHitWithSkull(cell) {
        return cell.querySelector('.hit.skull') !== null;
    }

    // Function to check if a cell has a question mark
    function hasQuestionMark(cell) {
        return cell.querySelector('.gift.animated.tin-in') !== null;
    }

    // Function to check if the game is in a ready state for an attack
    function isGameReady() {
        let opponentBoard = document.querySelector('.opponent app-battleship-board table');  // Opponent's board ID
        return opponentBoard && !opponentBoard.classList.contains('inactive'); // Adjust the class as per game state
    }
    
// Function to introduce a delay in milliseconds
function waitForAttack(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}


// Adjusted performAttack to add a 2-second delay and check board state
async function performAttack() {
    console.log("PerformAttack Function Called");
    const now = Date.now();

    // Check for confirmed hits first and handle all possible follow-ups
    if (confirmedHits.length > 0) {
        console.log("Following up on confirmed hits");
        if (potentialTargets.length > 0) {
            const nextTarget = potentialTargets.pop();
            console.log(`Attacking potential target around hit: (${nextTarget.row}, ${nextTarget.col})`);
            attackCell(nextTarget);
        } else {
            for (let i = confirmedHits.length - 1; i >= 0; i--) {
                const hitCell = confirmedHits[i];
                const cell = document.querySelector(`[data-row="${hitCell.row}"][data-col="${hitCell.col}"]`);
                if (cell) {
                    const newTargets = getAdjacentCells(cell).filter(adjCell =>
                        !isHitWithSkull(adjCell) &&
                        !adjCell.querySelector('.miss')
                    );
                    if (newTargets.length > 0) {
                        console.log("Generated new targets around hit");
                        potentialTargets = potentialTargets.concat(newTargets);
                        const nextTarget = potentialTargets.pop();
                        console.log(`Attacking generated target: (${nextTarget.row}, ${nextTarget.col})`);
                        attackCell(nextTarget);
                        return;
                    }
                }
            }
        }
    } else {
        let cell = huntMode ? huntModeAttack() : targetModeAttack();
        if (cell) {
            attackCell(cell);
        } else {
            console.log("No cell available to attack.");
        }
    }

    lastAttackTime = now;
}

GM.getValue('username').then(function(username) {
    if (!username) {
        username = prompt('Please enter your Papergames username:');
        GM.setValue('username', username);
    }
});

function updateBoard() {
    // Add a delay between checks
    const now = Date.now();
    if (now - lastCheckTime < CHECK_INTERVAL) {
        return;
    }
    lastCheckTime = now;

    GM.getValue("username").then(async function(username) {
        var profileOpener = [...document.querySelectorAll(".text-truncate.cursor-pointer")].find(
            opener => opener.textContent.trim() === username
        );

        if (!profileOpener) {
            console.log("Profile opener not found, waiting...");
            return;
        }

        var chronometer = document.querySelector("app-chronometer");
        var numberElement = profileOpener.parentNode ? profileOpener.parentNode.querySelectorAll("span")[4] : null;
        var currentElement = chronometer || numberElement;

        if (!currentElement) {
            console.log("Timer element not found, waiting...");
            return;
        }

        checkForErrorAndRefresh();

        try {
            var currentTime = parseInt(currentElement.textContent);
            
            // Check if it's our turn by verifying timer is changing
            if (lastTimerValue !== null) {
                const timeDiff = Math.abs(currentTime - lastTimerValue);
                console.log(`Timer difference: ${timeDiff} seconds`);
                
                // Only proceed if the time difference is at least 3 seconds
                if (timeDiff >= CHECK_INTERVAL/1000) {
                    console.log(`Timer changed significantly from ${lastTimerValue} to ${currentTime} - It's our turn!`);
                    // Only attack if we haven't already (timer decreasing)
                    if (currentTime < lastTimerValue) {
                        setTimeout(performAttack, CHECK_INTERVAL/1.5); // Slightly faster than check interval
                    }
                }
            } else {
                console.log(`Timer initialized at ${currentTime}`);
            }
            
            lastTimerValue = currentTime;
        } catch (error) {
            console.error("Error updating board:", error);
        }
    });
}

// Function to check for error message and refresh if needed
function checkForErrorAndRefresh() {
    const errorToast = document.querySelector('.toast-error .toast-message');
    if (errorToast && errorToast.textContent.includes('The targeted frame is already played')) {
        location.reload();
    }
}

// Function to find and click question mark cells
function handleQuestionMarkCells() {
    const questionCells = document.querySelectorAll('.gift.animated.tin-in .fa-question');
    if (questionCells.length > 0) {
        // Click the first question mark cell found
        const cell = questionCells[0].closest('.gift');
        if (cell) {
            cell.click();
            return true;
        }
    }
    return false;
}

// Function to handle hunting mode (random moves)
function huntModeAttack() {
    console.log("AI is in Hunt Mode. Analyzing board state...");
    let cells = getAvailableCells();
    if (cells.length === 0) {
        console.log("No available cells to attack!");
        return null;
    }

    // The cells are already sorted by probability score from getAvailableCells()
    const bestCell = cells[0];
    console.log("Selected cell with highest probability score: ", bestCell);

    // Extract the cell coordinates from the bestCell variable
    const className = bestCell.className;
    const regex = /cell-(\d+)-(\d+)/;
    const match = className.match(regex);
    if (match) {
        const x = parseInt(match[1]);
        const y = parseInt(match[2]);
        console.log("Extracted cell coordinates: ", x, y);
        return bestCell; // Return the bestCell directly
    } else {
        console.log("Failed to extract cell coordinates!");
        return null;
    }
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





// Set interval to update the board regularly
setInterval(updateBoard, CHECK_INTERVAL);
})();
