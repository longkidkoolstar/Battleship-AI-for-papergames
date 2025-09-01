// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      2.2.0
// @description  A probability-based AI for playing Battleship on papergames.io with toggleable visual probability overlay and statistical targeting
// @author       longkidkoolstar
// @match        https://papergames.io/*
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(function() {
    'use strict';

    // Game state variables for probability calculations
    let confirmedHits = []; // Still needed for probability bonuses
    let visualizationEnabled = true; // Toggle for probability visualization

    // Enhanced function to analyze the current board state for probability calculations
    function analyzeBoardState() {
        const board = Array(10).fill().map(() => Array(10).fill('unknown'));
        let hitCount = 0;
        let missCount = 0;
        let destroyedCount = 0;
        let availableCount = 0;

        // Specifically analyze the opponent's board
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) {
            console.log('Warning: Cannot find opponent board for analysis');
            return board;
        }

        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            const [row, col] = cell.className.match(/\d+/g).map(Number);

            // Check for previously tried cell (miss)
            if (cell.querySelector('svg.intersection.no-hit')) {
                board[row][col] = 'miss';
                missCount++;
            }
            // Check for hit
            else if (cell.querySelector('.hit.fire')) {
                board[row][col] = 'hit';
                hitCount++;
            }
            // Check for destroyed ship
            else if (cell.querySelector('.magictime.opacityIn.ship-cell.circle-dark')) {
                board[row][col] = 'destroyed';
                destroyedCount++;
            }
            // Normal untried cell
            else if (cell.querySelector('svg.intersection:not(.no-hit)')) {
                board[row][col] = 'available';
                availableCount++;
            }
        });

        // Log board analysis for debugging
        console.log(`Board Analysis - Hits: ${hitCount}, Misses: ${missCount}, Destroyed: ${destroyedCount}, Available: ${availableCount}`);
        
        return board;
    }

    // Enhanced function to get all available cells with probability-based scoring
    function getAvailableCells() {
        const cells = [];
        const board = analyzeBoardState();
        let questionMarkCount = 0;

        // Specifically target the opponent's board
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) {
            console.log('Error: Cannot find opponent board for cell analysis');
            return [];
        }

        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            // Consider both regular untried cells and question mark cells
            const isRegularCell = cell.classList.contains('null') && cell.querySelector('svg.intersection:not(.no-hit)');
            const isQuestionMark = hasQuestionMark(cell);
            
            if (isRegularCell || isQuestionMark) {
                const [row, col] = cell.className.match(/\d+/g).map(Number);
                let score = calculateProbabilityScore(row, col, board);
                
                if (isQuestionMark) {
                    questionMarkCount++;
                    console.log(`Question mark found at [${row},${col}] with score: ${score}`);
                }
                
                cells.push({ cell, score, row, col, isQuestionMark });
            }
        });

        // Sort cells by probability score (highest first)
        const sortedCells = cells.sort((a, b) => b.score - a.score);
        
        // Log top candidates for debugging
        console.log(`Found ${cells.length} available cells (${questionMarkCount} question marks)`);
        if (sortedCells.length > 0) {
            const topCells = sortedCells.slice(0, 3);
            console.log('Top 3 probability targets:', topCells.map(c => `[${c.row},${c.col}]:${c.score.toFixed(1)}${c.isQuestionMark ? '(?)' : ''}`).join(', '));
        }
        
        // Update probability visualization
        updateProbabilityVisualization(board);
        
        return sortedCells.map(item => item.cell);
    }

    // Function to create and update probability visualization overlay
    function updateProbabilityVisualization(board) {
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard || !visualizationEnabled) return;

        // Remove existing probability overlays
        document.querySelectorAll('.probability-overlay').forEach(overlay => overlay.remove());

        let maxScore = 0;
        const cellScores = [];

        // Calculate scores for all cells and find maximum
        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            const [row, col] = cell.className.match(/\d+/g).map(Number);
            const score = calculateProbabilityScore(row, col, board);
            cellScores.push({ cell, score, row, col });
            if (score > maxScore) maxScore = score;
        });

        // Create probability overlays for each cell
        cellScores.forEach(({ cell, score, row, col }) => {
            // Skip cells that are already hit, missed, or destroyed
            if (score === 0) return;

            const overlay = document.createElement('div');
            overlay.className = 'probability-overlay';
            overlay.style.cssText = `
                position: absolute;
                bottom: 2px;
                right: 2px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                font-size: 10px;
                font-weight: bold;
                padding: 1px 3px;
                border-radius: 3px;
                pointer-events: none;
                z-index: 1000;
                font-family: monospace;
            `;
            
            // Color code based on probability (green = high, yellow = medium, red = low)
            const intensity = maxScore > 0 ? score / maxScore : 0;
            if (intensity > 0.7) {
                overlay.style.background = 'rgba(0, 150, 0, 0.8)';
            } else if (intensity > 0.4) {
                overlay.style.background = 'rgba(200, 150, 0, 0.8)';
            } else {
                overlay.style.background = 'rgba(150, 0, 0, 0.8)';
            }
            
            overlay.textContent = score.toFixed(1);
            
            // Position the overlay relative to the cell
            cell.style.position = 'relative';
            cell.appendChild(overlay);
        });

        console.log(`Probability visualization updated. Max score: ${maxScore.toFixed(1)}`);
    }

    // Ship sizes in standard Battleship
    const SHIP_SIZES = [5, 4, 3, 3, 2]; // Carrier, Battleship, Cruiser, Submarine, Destroyer
    
    // Enhanced probability calculation based on ship placement possibilities and density
    function calculateProbabilityScore(row, col, board) {
        let totalProbability = 0;
        let densityBonus = 0;
        
        // For each ship size, calculate how many ways it can be placed through this cell
        SHIP_SIZES.forEach(shipSize => {
            let shipPlacements = 0;
            
            // Check horizontal placements
            for (let startCol = Math.max(0, col - shipSize + 1); startCol <= Math.min(9, col); startCol++) {
                if (startCol + shipSize <= 10) {
                    if (canPlaceShip(row, startCol, shipSize, 'horizontal', board)) {
                        shipPlacements += 1;
                    }
                }
            }
            
            // Check vertical placements
            for (let startRow = Math.max(0, row - shipSize + 1); startRow <= Math.min(9, row); startRow++) {
                if (startRow + shipSize <= 10) {
                    if (canPlaceShip(startRow, col, shipSize, 'vertical', board)) {
                        shipPlacements += 1;
                    }
                }
            }
            
            // Weight larger ships more heavily as they're harder to place
            totalProbability += shipPlacements * (shipSize / 3);
        });
        
        // Calculate density bonus - cells in areas with more possible ship placements
        const surroundingPositions = [
            [row-2, col], [row-1, col-1], [row-1, col], [row-1, col+1],
            [row, col-2], [row, col-1], [row, col+1], [row, col+2],
            [row+1, col-1], [row+1, col], [row+1, col+1], [row+2, col]
        ];
        
        surroundingPositions.forEach(([r, c]) => {
            if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                if (board[r] && (board[r][c] === 'unknown' || board[r][c] === 'available')) {
                    densityBonus += 0.5; // Small bonus for each available nearby cell
                }
            }
        });
        
        // Bonus for cells adjacent to confirmed hits (but not already hit)
        const adjacentCells = [
            [row-1, col], [row+1, col], [row, col-1], [row, col+1]
        ];
        
        let hitBonus = 0;
        adjacentCells.forEach(([r, c]) => {
            if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                if (board[r] && board[r][c] === 'hit') {
                    hitBonus += 100; // Very large bonus for adjacent cells
                }
            }
        });
        
        // Add bonus for cells 2 away from hits (potential ship continuation)
        const nearbyPositions = [
            [row-2, col], [row+2, col], [row, col-2], [row, col+2]
        ];
        
        nearbyPositions.forEach(([r, c]) => {
            if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                if (board[r] && board[r][c] === 'hit') {
                    hitBonus += 20; // Smaller bonus for cells 2 away
                }
            }
        });
        
        // Check if this cell has a question mark and add bonus score
        const cell = getCellByCoordinates(row, col);
        if (cell && hasQuestionMark(cell)) {
            const qmValue = evaluateQuestionMarkValue(cell);
            totalProbability += qmValue * 2; // Double the question mark value
        }
        
        return totalProbability + hitBonus + densityBonus;
    }
    
    // Enhanced function to check if a ship can be placed at a specific position
    function canPlaceShip(startRow, startCol, shipSize, orientation, board) {
        for (let i = 0; i < shipSize; i++) {
            const checkRow = orientation === 'vertical' ? startRow + i : startRow;
            const checkCol = orientation === 'horizontal' ? startCol + i : startCol;
            
            // Check bounds
            if (checkRow < 0 || checkRow >= 10 || checkCol < 0 || checkCol >= 10) {
                return false;
            }
            
            // Check if cell is already hit, missed, or destroyed
            if (board[checkRow] && (board[checkRow][checkCol] === 'miss' || board[checkRow][checkCol] === 'destroyed')) {
                return false;
            }
        }
        
        // Additional check: ensure ship placement doesn't conflict with known ship patterns
        // This helps avoid placing ships too close to already destroyed ships
        const buffer = 1;
        for (let i = -buffer; i < shipSize + buffer; i++) {
            const checkRow = orientation === 'vertical' ? startRow + i : startRow;
            const checkCol = orientation === 'horizontal' ? startCol + i : startCol;
            
            if (checkRow >= 0 && checkRow < 10 && checkCol >= 0 && checkCol < 10) {
                // If we find a destroyed cell adjacent to our potential ship placement,
                // we need to be more careful about placement
                if (board[checkRow] && board[checkRow][checkCol] === 'destroyed') {
                    // Only allow if this destroyed cell could be part of our ship
                    if (i >= 0 && i < shipSize) {
                        continue; // This is fine, destroyed cell is part of our ship
                    } else {
                        // Destroyed cell is adjacent, which might indicate ship spacing rules
                        // For now, we'll allow it but this could be enhanced based on game rules
                    }
                }
            }
        }
        
        return true;
    }



// Simplified handleAttackResult for probability-based system
function handleAttackResult(cell) {
    // Extract row and column from cell class name
    const [row, col] = getCellCoordinates(cell);

    if (isHitWithSkull(cell)) {
        const hitCoord = {
            row: row,
            col: col
        };
        confirmedHits.push(hitCoord);
        console.log('Confirmed hit at:', hitCoord);
    } else if (cell.querySelector('.miss')) {
        console.log('Miss on cell:', getCellCoordinates(cell));
    }

    // Check if ship was sunk and clear hits if so
    if (cell.querySelector('.magictime.opacityIn.ship-cell.circle-dark')) {
        console.log('Ship sunk! Removing sunk ship hits from confirmed hits.');
        confirmedHits = [];
    }
}

// Function to get adjacent cells with optional radius for probability calculations
function getAdjacentCells(cell, radius = 1) {
    const [row, col] = getCellCoordinates(cell);
    let adjacentCells = [];

    if (radius === 1) {
        // Standard adjacent cells (up, down, left, right)
        adjacentCells.push(
            getCellByCoordinates(row-1, col),
            getCellByCoordinates(row+1, col),
            getCellByCoordinates(row, col-1),
            getCellByCoordinates(row, col+1)
        );
    } else {
        // For larger radius, get all cells within the specified distance
        for (let dRow = -radius; dRow <= radius; dRow++) {
            for (let dCol = -radius; dCol <= radius; dCol++) {
                if (dRow === 0 && dCol === 0) continue; // Skip the center cell
                
                const newRow = row + dRow;
                const newCol = col + dCol;

                // Check if the new position is within bounds
                if (newRow >= 0 && newRow < 10 && newCol >= 0 && newCol < 10) {
                    const adjacentCell = getCellByCoordinates(newRow, newCol);
                    if (adjacentCell) {
                        adjacentCells.push(adjacentCell);
                    }
                }
            }
        }
    }

    // Filter out null cells and already attacked cells, but include question marks
    return adjacentCells.filter(cell => {
        if (!cell) return false;
        
        // Include question mark cells as valid targets
        if (hasQuestionMark(cell)) {
            return true;
        }
        
        // Include regular null cells that haven't been attacked
        return cell.classList.contains('null') && cell.querySelector('svg.intersection:not(.no-hit)');
    });
}

// Function to determine orientation based on confirmed hits
function determineOrientation(hitsToCheck) {
    // If no hits are provided, use the confirmed hits
    if (!hitsToCheck) {
        hitsToCheck = confirmedHits.slice();
    }

    // Need at least 2 hits to determine orientation
    if (!hitsToCheck || hitsToCheck.length < 2) {
        console.log('Not enough hits to determine orientation');
        return null;
    }

    // Create copies of the arrays to avoid modifying the original
    const sortedByRow = [...hitsToCheck].sort((a, b) => a.row - b.row);
    const sortedByCol = [...hitsToCheck].sort((a, b) => a.col - b.col);

    // Check if all hits are in the same column (vertical orientation)
    let sameColumn = true;
    for (let i = 1; i < sortedByCol.length; i++) {
        if (sortedByCol[i].col !== sortedByCol[0].col) {
            sameColumn = false;
            break;
        }
    }

    // Check if all hits are in the same row (horizontal orientation)
    let sameRow = true;
    for (let i = 1; i < sortedByRow.length; i++) {
        if (sortedByRow[i].row !== sortedByRow[0].row) {
            sameRow = false;
            break;
        }
    }

    if (sameColumn) {
        console.log('Determined vertical orientation');
        return 'vertical';
    }
    if (sameRow) {
        console.log('Determined horizontal orientation');
        return 'horizontal';
    }

    console.log('Could not determine orientation');
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

        // Check if the question mark is aligned with confirmed hits
        if (confirmedHits.length >= 2 && shipOrientation) {
            let isAligned = false;

            if (shipOrientation === 'horizontal') {
                // Check if question mark is in the same row as any confirmed hit
                for (const hit of confirmedHits) {
                    if (hit.row === row) {
                        isAligned = true;
                        break;
                    }
                }
            } else if (shipOrientation === 'vertical') {
                // Check if question mark is in the same column as any confirmed hit
                for (const hit of confirmedHits) {
                    if (hit.col === col) {
                        isAligned = true;
                        break;
                    }
                }
            }

            // If aligned with confirmed hits, give it a significant bonus
            if (isAligned) {
                value += 8;
                console.log(`Question mark at [${row},${col}] is aligned with ship orientation, adding bonus value`);
            }
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

// Simplified probability-based attack system
function updateBoard() {
    console.log("=== AI Turn Started ===");
    
    // Update probability visualization first
    const board = analyzeBoardState();
    updateProbabilityVisualization(board);
    
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

        // Use pure probability-based targeting
        const bestCell = findBestProbabilityCell();
        if (bestCell) {
            console.log("Selected optimal cell based on probability calculations");
            attackCell(bestCell);
            return;
        }

        // Fallback if no cells available
        console.log("No valid cells found to attack!");
        performAttack(currentElement.textContent);
    });
}

// Manual function to refresh probability visualization
function refreshProbabilityVisualization() {
    const board = analyzeBoardState();
    updateProbabilityVisualization(board);
    console.log("Probability visualization manually refreshed");
}

// Expose functions to global scope for manual triggering
window.refreshProbabilityVisualization = refreshProbabilityVisualization;
window.toggleProbabilityVisualization = function() {
    visualizationEnabled = !visualizationEnabled;
    if (visualizationEnabled) {
        console.log('Probability visualization enabled');
        refreshProbabilityVisualization();
    } else {
        console.log('Probability visualization disabled');
        // Remove all existing overlays
        const overlays = document.querySelectorAll('.probability-overlay');
        overlays.forEach(overlay => overlay.remove());
    }
    return visualizationEnabled;
};

// Function to find the cell with the highest probability score
function findBestProbabilityCell() {
    const board = analyzeBoardState();
    const opponentBoard = document.querySelector('.opponent app-battleship-board table');
    if (!opponentBoard) {
        console.log('Cannot find opponent board');
        return null;
    }

    let bestCell = null;
    let bestScore = -1;

    opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
        // Only consider cells that haven't been attacked
        if (cell.classList.contains('null') && cell.querySelector('svg.intersection:not(.no-hit)') || hasQuestionMark(cell)) {
            const [row, col] = getCellCoordinates(cell);
            const score = calculateProbabilityScore(row, col, board);
            
            console.log(`Cell [${row},${col}] probability score: ${score}`);
            
            if (score > bestScore) {
                bestScore = score;
                bestCell = cell;
            }
        }
    });

    console.log(`Best cell found with score: ${bestScore}`);
    return bestCell;
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

// Legacy functions removed - now using pure probability-based targeting





    // Create toggle button for probability visualization
    function createToggleButton() {
        // Check if button already exists
        if (document.getElementById('probability-toggle')) return;
        
        const button = document.createElement('button');
        button.id = 'probability-toggle';
        button.textContent = 'Toggle Probability View';
        button.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            padding: 8px 12px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        
        button.addEventListener('click', function() {
            const enabled = window.toggleProbabilityVisualization();
            button.style.background = enabled ? '#4CAF50' : '#f44336';
            button.textContent = enabled ? 'Hide Probability View' : 'Show Probability View';
        });
        
        document.body.appendChild(button);
    }
    
    // Initialize toggle button when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createToggleButton);
    } else {
        createToggleButton();
    }

// Set interval to update the board regularly
setInterval(updateBoard, 1000); // Check every second
})();
