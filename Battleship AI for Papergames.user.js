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

    // Function to determine ship orientation from hits
    function determineOrientation() {
        if (confirmedHits.length < 2) return null;
        
        // Sort hits by row and column to find pattern
        const sortedByRow = [...confirmedHits].sort((a, b) => a.row - b.row);
        const sortedByCol = [...confirmedHits].sort((a, b) => a.col - b.col);
        
        // Check if hits are in same column (vertical)
        if (sortedByCol[0].col === sortedByCol[1].col) {
            return 'vertical';
        }
        // Check if hits are in same row (horizontal)
        if (sortedByRow[0].row === sortedByRow[1].row) {
            return 'horizontal';
        }
        return null;
    }

    // Function to generate adjacent cells around a hit cell
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

    // Modified handleAttackResult to track hits
    function handleAttackResult(cell) {
        if (isHitWithSkull(cell)) {
            const hitCoord = {
                row: parseInt(cell.getAttribute('data-row')),
                col: parseInt(cell.getAttribute('data-col'))
            };
            confirmedHits.push(hitCoord);
            
            // Determine direction if we have multiple hits
            if (confirmedHits.length === 2) {
                const firstHit = confirmedHits[0];
                const secondHit = confirmedHits[1];
                if (firstHit.row === secondHit.row) {
                    shipOrientation = 'horizontal';
                } else if (firstHit.col === secondHit.col) {
                    shipOrientation = 'vertical';
                }
            }
            
            huntMode = false;
            lastHit = cell;
            
            // Prioritize targets in the determined direction
            let adjacentCells = getAdjacentCells(cell);
            if (shipOrientation === 'horizontal') {
                potentialTargets = potentialTargets.concat(
                    adjacentCells.filter(adjCell => 
                        !isHitWithSkull(adjCell) && 
                        !adjCell.querySelector('.miss') &&
                        parseInt(adjCell.getAttribute('data-row')) === hitCoord.row
                    )
                );
            } else if (shipOrientation === 'vertical') {
                potentialTargets = potentialTargets.concat(
                    adjacentCells.filter(adjCell => 
                        !isHitWithSkull(adjCell) && 
                        !adjCell.querySelector('.miss') &&
                        parseInt(adjCell.getAttribute('data-col')) === hitCoord.col
                    )
                );
            } else {
                // If no orientation, consider all directions
                potentialTargets = potentialTargets.concat(
                    adjacentCells.filter(adjCell => 
                        !isHitWithSkull(adjCell) && 
                        !adjCell.querySelector('.miss')
                    )
                );
            }
            
            console.log('Added adjacent cells as potential targets:', potentialTargets);
        } else if (cell.querySelector('.miss')) {
            console.log('Miss on cell:', cell);
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
        
        // Check for confirmed hits first and handle all possible follow-ups
        if (confirmedHits.length > 0) {
            console.log("Following up on confirmed hits");
            if (potentialTargets.length > 0) {
                const nextTarget = potentialTargets.pop();
                console.log("Attacking potential target around hit");
                attackCell(nextTarget);
                return;
            }

            // Try to generate new targets around ALL confirmed hits if no current targets
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
                        attackCell(potentialTargets.pop());
                        return;
                    }
                }
            }
        }
        
        // Only check question marks if we have exhausted all hit-related moves
        const questionMarkCells = Array.from(document.querySelectorAll('td')).filter(cell => hasQuestionMark(cell));
        if (questionMarkCells.length > 0) {
            console.log("No hits to follow up, targeting question mark");
            attackCell(questionMarkCells[0]);
            return;
        }

        // Fall back to hunt mode if no other options
        console.log("No hits or question marks, performing regular hunt mode attack");
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

// Function to add active targets
function addActiveTargets(hitCell) {
    const [x, y] = hitCell;
    const potentialTargets = [
        [x - 1, y], // Up
        [x + 1, y], // Down
        [x, y - 1], // Left
        [x, y + 1]  // Right
    ];
    for (const [px, py] of potentialTargets) {
        if (isValidGuess(px, py) && !isAlreadyTargeted(px, py)) {
            activeTargets.push([px, py]);
        }
    }
}

// Function to check if a guess is valid
function isValidGuess(x, y) {
    // Check if the cell is within bounds and hasn't been guessed already
    const board = analyzeBoardState();
    return x >= 0 && x < 10 && y >= 0 && y < 10 && board[x][y] === 'available';
}

// Function to check if a cell is already targeted
function isAlreadyTargeted(x, y) {
    // Check if the cell is already in the active targets queue
    return activeTargets.some(([tx, ty]) => tx === x && ty === y);
}

// Function to get the next guess
function getNextGuess() {
    if (activeTargets.length > 0) {
        // Prioritize finishing a ship
        return activeTargets.shift();
    }
    // Otherwise, fall back to probability-based hunt mode
    return getNextHuntGuess();
}

// Function to get the next hunt guess
function getNextHuntGuess() {
    const cells = getAvailableCells();
    if (cells.length > 0) {
        return cells[0];
    }
    return null;
}

// Function to update orientation
function updateOrientation(hitCell) {
    const [x, y] = hitCell;

    // Check neighbors to determine orientation
    const neighbors = [
        [x - 1, y], [x + 1, y], // Vertical neighbors
        [x, y - 1], [x, y + 1]  // Horizontal neighbors
    ];

    for (const [nx, ny] of neighbors) {
        if (isValidHit(nx, ny)) {
            if (nx === x) {
                orientation = 'horizontal';
            } else if (ny === y) {
                orientation = 'vertical';
            }
            return;
        }
    }
}

// Function to check if a hit is valid
function isValidHit(x, y) {
    // Check if the cell is a valid hit
    const board = analyzeBoardState();
    return x >= 0 && x < 10 && y >= 0 && y < 10 && board[x][y] === 'hit';
}

// Function to get the next guess from orientation
function getNextGuessFromOrientation(lastHit) {
    const [x, y] = lastHit;

    if (orientation === 'horizontal') {
        return [[x, y - 1], [x, y + 1]].find(([nx, ny]) => isValidGuess(nx, ny));
    } else if (orientation === 'vertical') {
        return [[x - 1, y], [x + 1, y]].find(([nx, ny]) => isValidGuess(nx, ny));
    }

    // If no orientation yet, guess around
    return activeTargets.shift();
}

// Function to get the next target guess
function getNextTargetGuess() {
    if (orientation) {
        // Follow locked orientation
        const target = getNextGuessFromOrientation(activeTargets[0]);
        if (target) return target;
    }

    // Default to first in active targets if no orientation is determined
    return activeTargets.shift();
}

// Function to play a turn
function playTurn() {
    const nextGuess = getNextGuess();

    // Perform the guess
    const [x, y] = nextGuess;
    const result = makeGuess(x, y); // Function to guess and receive feedback (hit/miss/destroyed)

    if (result === 'hit') {
        const board = analyzeBoardState();
        board[x][y] = 'hit';
        addActiveTargets([x, y]);
        updateOrientation([x, y]);
    } else if (result === 'destroyed') {
        const board = analyzeBoardState();
        board[x][y] = 'destroyed';
        orientation = null; // Reset orientation after ship is sunk
        activeTargets = []; // Clear active targets
    } else {
        const board = analyzeBoardState();
        board[x][y] = 'miss';
    }
}

// Set interval to update the board regularly
setInterval(updateBoard, 1000); // Check every second
})();
