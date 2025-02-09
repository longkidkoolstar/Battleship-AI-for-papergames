// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      1.0
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

// Update the updateBoard function to prioritize confirmed hits over question marks
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

        // Check for error message first
        checkForErrorAndRefresh();
        
        // Always prioritize targeting around confirmed hits
        if (confirmedHits.length > 0) {
            console.log("Following up on confirmed hits...");
            if (potentialTargets.length > 0) {
                const nextTarget = potentialTargets[potentialTargets.length - 1];
                console.log("Targeting adjacent to hit:", nextTarget);
                attackCell(nextTarget);
                return;
            } else {
                // If we have hits but no potential targets, regenerate adjacent cells
                const lastHitCell = confirmedHits[confirmedHits.length - 1];
                const cell = document.querySelector(`[data-row="${lastHitCell.row}"][data-col="${lastHitCell.col}"]`);
                if (cell) {
                    const newTargets = getAdjacentCells(cell).filter(adjCell => 
                        !isHitWithSkull(adjCell) && 
                        !adjCell.querySelector('.miss')
                    );
                    if (newTargets.length > 0) {
                        console.log("Generated new targets around hit");
                        potentialTargets = potentialTargets.concat(newTargets);
                        attackCell(potentialTargets.pop());
                        return;
                    }
                }
            }
        }
        
        // Prioritize question marks if there are no confirmed hits
        const questionMarkCells = Array.from(document.querySelectorAll('td')).filter(cell => hasQuestionMark(cell));
        if (questionMarkCells.length > 0) {
            console.log("No hits to follow up, targeting question mark");
            attackCell(questionMarkCells[0]);
            return;
        }

        // Fall back to hunt mode if no other options
        console.log("No hits or question marks, performing regular hunt mode attack...");
        performAttack(currentElement.textContent);
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
    // So we'll take the highest scoring cell
    const bestCell = cells[0];
    console.log("Selected cell with highest probability score");
    return bestCell;
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
setInterval(updateBoard, 1000); // Check every second
})();
