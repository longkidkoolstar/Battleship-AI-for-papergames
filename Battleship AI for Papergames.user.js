// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      1.0.2
// @description  An enhanced AI for playing Battleship on papergames.io with strategic moves and console logging
// @author       longkidkoolstar
// @match        https://papergames.io/*
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(function() {
    'use strict';

    let huntMode = true;
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

        // Check if this cell has a question mark and add bonus score
        const cell = getCellByCoordinates(row, col);
        if (cell && hasQuestionMark(cell)) {
            score += evaluateQuestionMarkValue(cell);
        }

        // Check for patterns that suggest ships
        // Look for two hits in a row with a gap
        for (const [dx, dy] of directions) {
            const row1 = row + dx;
            const col1 = col + dy;
            const row2 = row + dx * 2;
            const col2 = col + dy * 2;

            if (row1 >= 0 && row1 < 10 && col1 >= 0 && col1 < 10 &&
                row2 >= 0 && row2 < 10 && col2 >= 0 && col2 < 10) {
                // If we have hit, unknown, hit pattern, the unknown is very likely
                if (board[row1][col1] === 'hit' && board[row2][col2] === 'hit') {
                    score += 5;
                }
            }
        }

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
    // Extract row and column from cell class name
    const [row, col] = getCellCoordinates(cell);

    // Set data attributes for easier access later
    if (!cell.hasAttribute('data-row')) {
        cell.setAttribute('data-row', row);
    }
    if (!cell.hasAttribute('data-col')) {
        cell.setAttribute('data-col', col);
    }

    if (isHitWithSkull(cell)) {
        const hitCoord = {
            row: row,
            col: col
        };
        confirmedHits.push(hitCoord);

        // Determine orientation if we have multiple hits
        if (confirmedHits.length >= 2) {
            shipOrientation = determineOrientation();
        }

        huntMode = false;

        // Get adjacent cells for targeting
        let adjacent = getAdjacentCells(cell);
        potentialTargets.push(...adjacent.filter(adjCell =>
            adjCell && !isHitWithSkull(adjCell) &&
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
    const [row, col] = getCellCoordinates(cell);
    let adjacentCells = [];

    if (shipOrientation === 'vertical') {
        // Only add cells above and below
        adjacentCells.push(
            getCellByCoordinates(row-1, col),
            getCellByCoordinates(row+1, col)
        );
    } else if (shipOrientation === 'horizontal') {
        // Only add cells left and right
        adjacentCells.push(
            getCellByCoordinates(row, col-1),
            getCellByCoordinates(row, col+1)
        );
    } else {
        // No orientation determined yet, check all directions
        adjacentCells.push(
            getCellByCoordinates(row-1, col),
            getCellByCoordinates(row+1, col),
            getCellByCoordinates(row, col-1),
            getCellByCoordinates(row, col+1)
        );
    }

    // Filter out null cells and already attacked cells
    return adjacentCells.filter(cell =>
        cell && cell.classList.contains('null') && cell.querySelector('svg.intersection:not(.no-hit)')
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
        return cell.querySelector('.gift.animated.tin-in') !== null || cell.querySelector('.gift-taken') !== null;
    }

    // Function to evaluate the strategic value of a question mark
    function evaluateQuestionMarkValue(cell) {
        if (!hasQuestionMark(cell)) return 0;

        const [row, col] = getCellCoordinates(cell);
        let value = 5; // Base value for question marks

        // Check surrounding cells for hits or misses to determine strategic value
        const surroundingCells = getSurroundingCells(row, col);
        let hitCount = 0;
        let missCount = 0;

        surroundingCells.forEach(coords => {
            const surroundingCell = getCellByCoordinates(coords.row, coords.col);
            if (surroundingCell) {
                if (isHitWithSkull(surroundingCell)) {
                    hitCount++;
                    value += 3; // Increase value if near a hit
                } else if (surroundingCell.querySelector('.miss')) {
                    missCount++;
                    value -= 1; // Decrease value if near a miss
                }
            }
        });

        // If the question mark is surrounded by many misses, it's less valuable
        if (missCount > 2) value -= 3;

        // If the question mark is near hits, it's more valuable
        if (hitCount > 0) value += hitCount * 2;

        // Check if the question mark is in a strategic position (center or edges)
        if ((row > 2 && row < 7) && (col > 2 && col < 7)) {
            value += 2; // Center positions are more valuable
        }

        return value;
    }

    // Helper function to get cell coordinates
    function getCellCoordinates(cell) {
        const classNames = cell.className.match(/cell-(\d+)-(\d+)/);
        if (classNames && classNames.length >= 3) {
            return [parseInt(classNames[1]), parseInt(classNames[2])];
        }
        return [0, 0]; // Default if not found
    }

    // Helper function to get surrounding cells (8 directions)
    function getSurroundingCells(row, col) {
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        return directions.map(([dx, dy]) => {
            const newRow = row + dx;
            const newCol = col + dy;
            if (newRow >= 0 && newRow < 10 && newCol >= 0 && newCol < 10) {
                return { row: newRow, col: newCol };
            }
            return null;
        }).filter(coords => coords !== null);
    }

    // Helper function to get cell by coordinates
    function getCellByCoordinates(row, col) {
        return document.querySelector(`.cell-${row}-${col}`);
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
    GM.getValue("username").then(function(username) {
        var profileOpener = [...document.querySelectorAll(".text-truncate.cursor-pointer")].find(
            opener => opener.textContent.trim() === username
        );

        var chronometer = document.querySelector("app-chronometer");
        var numberElement = profileOpener.parentNode ? profileOpener.parentNode.querySelectorAll("span")[4] : null;

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
                    } else {
                        // If no new targets are generated, check all confirmed hits for potential targets
                        confirmedHits.forEach(hit => {
                            const hitCell = document.querySelector(`[data-row="${hit.row}"][data-col="${hit.col}"]`);
                            if (hitCell) {
                                const newTargets = getAdjacentCells(hitCell).filter(adjCell =>
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
                        });
                    }
                }
            }
        }

        // Handle question marks more intelligently
        const bestQuestionMark = findBestQuestionMarkCell();
        if (bestQuestionMark) {
            // If we have confirmed hits, decide whether to follow up or take a question mark
            if (confirmedHits.length > 0) {
                // If the question mark has a very high value, consider taking it
                const questionMarkValue = evaluateQuestionMarkValue(bestQuestionMark);

                // If the question mark is very valuable (near hits or in strategic position)
                // or if we've been struggling to find more hits, take the question mark
                if (questionMarkValue > 10 || (confirmedHits.length === 1 && potentialTargets.length === 0)) {
                    console.log("Found high-value question mark (value: " + questionMarkValue + "), targeting it");
                    attackCell(bestQuestionMark);
                    return;
                } else {
                    console.log("Question mark available but continuing to follow up on hits");
                }
            } else {
                // If no confirmed hits, always take the best question mark
                console.log("No hits to follow up, targeting best question mark");
                attackCell(bestQuestionMark);
                return;
            }
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

// Function to find the best question mark cell (used by other functions)
function findBestQuestionMarkCell() {
    const questionCells = document.querySelectorAll('.gift.animated.tin-in .fa-question');
    if (questionCells.length > 0) {
        // Evaluate all question mark cells and pick the best one
        const questionMarkElements = Array.from(questionCells).map(q => q.closest('.gift'));
        const cellsWithValues = questionMarkElements.map(cell => {
            if (!cell) return null;
            const tdCell = cell.closest('td');
            if (!tdCell) return null;
            return {
                cell: tdCell,
                value: evaluateQuestionMarkValue(tdCell)
            };
        }).filter(item => item !== null);

        // Sort by value and return the best one
        if (cellsWithValues.length > 0) {
            cellsWithValues.sort((a, b) => b.value - a.value);
            console.log("Found best question mark with value: " + cellsWithValues[0].value);
            return cellsWithValues[0].cell;
        }
    }
    return null;
}

// Function to handle hunting mode (random moves)
function huntModeAttack() {
    console.log("AI is in Hunt Mode. Analyzing board state...");
    let cells = getAvailableCells();

    if (cells.length === 0) {
        console.log("No available cells to attack!");
        return null;
    }

    // Check for question marks first
    const bestQuestionMark = findBestQuestionMarkCell();
    if (bestQuestionMark) {
        const value = evaluateQuestionMarkValue(bestQuestionMark);
        console.log("Found question mark in hunt mode with value: " + value);

        // If the question mark has a good value, target it
        if (value > 5) {
            console.log("Targeting high-value question mark in hunt mode");
            return bestQuestionMark;
        }
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
