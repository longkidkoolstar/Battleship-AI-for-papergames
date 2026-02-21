// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      5.0.0
// @description  Advanced AI for Battleship on papergames.io with strategic weapon selection, Bayesian inference, and probability visualization
// @author       longkidkoolstar
// @match        https://papergames.io/*
// @grant        GM.setValue
// @grant        GM.getValue
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // Game state variables for probability calculations
    let confirmedHits = []; // Still needed for probability bonuses
    let visualizationEnabled = true; // Toggle for probability visualization

    // Auto queue variables
    let isAutoQueueOn = false;
    let autoQueueToggleButton = null;

    // Ship tracking system
    let remainingShips = [5, 4, 3, 3, 2]; // Standard Battleship ships: Carrier, Battleship, Cruiser, Submarine, Destroyer
    let sunkShips = [];
    let totalHitsOnBoard = 0;
    let totalSunkCells = 0;

    // Weapon system variables
    let availableWeapons = {
        default: true,
        missile: 0,
        fragmentBomb: 0,
        nuclearBomb: 0
    };

    // Weapon detection system
    function detectAvailableWeapons() {
        const weaponButtons = document.querySelectorAll('.weapon-button');
        console.log(`Found ${weaponButtons.length} weapon buttons`);

        availableWeapons = {
            default: true,
            missile: 0,
            fragmentBomb: 0,
            nuclearBomb: 0
        };

        weaponButtons.forEach((button, index) => {
            const img = button.querySelector('img');
            const badge = button.querySelector('.badge');
            const isDisabled = button.hasAttribute('disabled');

            console.log(`Button ${index}: img=${!!img}, badge=${!!badge}, disabled=${isDisabled}`);

            if (img && badge) {
                const weaponType = img.getAttribute('alt');
                const count = parseInt(badge.textContent) || 0;

                console.log(`  Weapon type: ${weaponType}, count: ${count}, badge text: '${badge.textContent}'`);

                switch (weaponType) {
                    case 'missile':
                        availableWeapons.missile = isDisabled ? 0 : count;
                        console.log(`  Set missile count to: ${availableWeapons.missile}`);
                        break;
                    case 'fragment-bomb':
                        availableWeapons.fragmentBomb = isDisabled ? 0 : count;
                        break;
                    case 'nuclear-bomb':
                        availableWeapons.nuclearBomb = isDisabled ? 0 : count;
                        break;
                    case 'default':
                        availableWeapons.default = true;
                        break;
                }
            } else {
                console.log(`  Button ${index} missing img or badge`);
            }
        });

        console.log('Final available weapons:', availableWeapons);
        return availableWeapons;
    }

    // Strategic weapon selection system
    function selectOptimalWeapon(targetRow, targetCol, board, probabilityScores) {
        detectAvailableWeapons();

        const gameProgress = (totalSunkCells + totalHitsOnBoard) / 17;
        const hasConfirmedHits = confirmedHits.length > 0;

        console.log(`=== WEAPON SELECTION DEBUG ===`);
        console.log(`Target: [${targetRow},${targetCol}], Game Progress: ${gameProgress.toFixed(2)}, Has Hits: ${hasConfirmedHits}`);
        console.log(`Available weapons:`, availableWeapons);

        // Nuclear bomb strategy - maximum area coverage
        if (availableWeapons.nuclearBomb > 0) {
            console.log(`Checking nuclear bomb...`);
            if (shouldUseNuclearBomb(targetRow, targetCol, board, probabilityScores, gameProgress)) {
                console.log(`NUCLEAR BOMB SELECTED!`);
                return 'nuclear-bomb';
            }
        }

        // Fragment bomb strategy - high probability clusters
        if (availableWeapons.fragmentBomb > 0) {
            console.log(`Checking fragment bomb...`);
            if (shouldUseFragmentBomb(targetRow, targetCol, board, probabilityScores, gameProgress)) {
                console.log(`FRAGMENT BOMB SELECTED!`);
                return 'fragment-bomb';
            }
        }

        // Missile strategy - confirmed hits and surrounding area
        if (availableWeapons.missile > 0) {
            console.log(`Checking missile (count: ${availableWeapons.missile})...`);
            if (shouldUseMissile(targetRow, targetCol, board, hasConfirmedHits, probabilityScores)) {
                console.log(`MISSILE SELECTED!`);
                return 'missile';
            } else {
                console.log(`Missile not selected - conditions not met`);
            }
        } else {
            console.log(`No missiles available (count: ${availableWeapons.missile})`);
        }

        // Default to single shot
        console.log(`Defaulting to single shot`);
        return 'default';
    }

    // Evaluates the total PROBABILITY YIELD of a weapon fired at a specific coordinate
    function evaluateWeaponYield(row, col, weaponType, probabilityScores) {
        let pattern = [];

        switch (weaponType) {
            case 'nuclear-bomb':
                // 3x3 square
                pattern = [
                    [row, col],
                    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
                    [row - 1, col - 1], [row - 1, col + 1], [row + 1, col - 1], [row + 1, col + 1]
                ];
                break;
            case 'fragment-bomb':
                // target + 3 directly above
                pattern = [
                    [row, col],
                    [row - 1, col], [row - 2, col], [row - 3, col]
                ];
                break;
            case 'missile':
                // cross shape
                pattern = [
                    [row, col],
                    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
                ];
                break;
            default:
                return 0;
        }

        return pattern.reduce((sum, [r, c]) => {
            if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                return sum + (probabilityScores[r][c] || 0);
            }
            return sum;
        }, 0);
    }

    // Nuclear bomb strategy: 3x3 area with corners
    function shouldUseNuclearBomb(targetRow, targetCol, board, probabilityScores, gameProgress) {
        const yieldValue = evaluateWeaponYield(targetRow, targetCol, 'nuclear-bomb', probabilityScores);
        const cellValue = probabilityScores[targetRow][targetCol] || 1;

        // Use early game if an incredible quadrant density exists
        if (gameProgress < 0.3) {
            return yieldValue > 250;
        }

        // Mid-late game: Ensure the absolute yield is at least 3x better than a single-target strike
        return yieldValue >= cellValue * 3.0 && yieldValue > 150;
    }

    // Fragment bomb strategy: 4 vertical hits
    function shouldUseFragmentBomb(targetRow, targetCol, board, probabilityScores, gameProgress) {
        const yieldValue = evaluateWeaponYield(targetRow, targetCol, 'fragment-bomb', probabilityScores);
        const cellValue = probabilityScores[targetRow][targetCol] || 1;

        // We want strict, surgically dense vertical probability arrays.
        return yieldValue >= cellValue * 2.0 && yieldValue > 100;
    }

    // Missile strategy: 5 hits in plus pattern
    function shouldUseMissile(targetRow, targetCol, board, hasConfirmedHits, probabilityScores) {
        const yieldValue = evaluateWeaponYield(targetRow, targetCol, 'missile', probabilityScores);
        const cellValue = probabilityScores[targetRow][targetCol] || 1;

        if (hasConfirmedHits) {
            // If hits are active on the board, we already use strict targeting overlay
            // Require just a minor bump in yield to finish a ship faster.
            return yieldValue >= cellValue * 1.2 && yieldValue > 25;
        }

        // Just >1.5x return is good enough for a missile to explore the board wildly
        return yieldValue >= cellValue * 1.5 && yieldValue > 50;
    }

    // Weapon execution system
    function selectAndUseWeapon(weaponType) {
        console.log(`=== WEAPON EXECUTION DEBUG ===`);
        console.log(`Attempting to select weapon: ${weaponType}`);

        const weaponButtons = document.querySelectorAll('.weapon-button');
        console.log(`Found ${weaponButtons.length} weapon buttons for selection`);

        let weaponFound = false;
        let weaponSelected = false;

        weaponButtons.forEach((button, index) => {
            const img = button.querySelector('img');
            if (img) {
                const currentWeapon = img.getAttribute('alt');
                console.log(`Button ${index}: weapon type = ${currentWeapon}`);

                // Remove current selection
                button.classList.remove('is-selected');

                // Select the desired weapon
                if (currentWeapon === weaponType) {
                    weaponFound = true;
                    button.classList.add('is-selected');
                    button.click();
                    console.log(`Successfully selected weapon: ${weaponType}`);
                    weaponSelected = true;
                    return true;
                }
            } else {
                console.log(`Button ${index}: no img found`);
            }
        });

        if (!weaponFound) {
            console.log(`ERROR: Weapon type '${weaponType}' not found in available buttons`);
        }

        return weaponSelected;
    }

    // Helper function to get cell coordinates
    function getCellCoordinates(cellElement) {
        // First try data attributes
        let row = parseInt(cellElement.getAttribute('data-row'));
        let col = parseInt(cellElement.getAttribute('data-col'));

        // If data attributes don't exist, try class name pattern
        if (isNaN(row) || isNaN(col)) {
            const classNames = cellElement.className.match(/cell-(\d+)-(\d+)/);
            if (classNames && classNames.length >= 3) {
                row = parseInt(classNames[1]);
                col = parseInt(classNames[2]);
            } else {
                // Fallback: try extracting from any numeric classes
                const numbers = cellElement.className.match(/\d+/g);
                if (numbers && numbers.length >= 2) {
                    row = parseInt(numbers[0]);
                    col = parseInt(numbers[1]);
                }
            }
        }

        return [row || 0, col || 0];
    }

    // Enhanced function to analyze the current board state for probability calculations
    function analyzeBoardState() {
        const board = Array(10).fill().map(() => Array(10).fill('unknown'));
        let hitCount = 0;
        let missCount = 0;
        let destroyedCount = 0;
        let availableCount = 0;
        let newConfirmedHits = [];

        // Specifically analyze the opponent's board
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) {
            console.log('Warning: Cannot find opponent board for analysis');
            return board;
        }

        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            const [row, col] = cell.className.match(/\d+/g).map(Number);

            // Check for destroyed ship FIRST
            if (cell.querySelector('.magictime.opacityIn.ship-cell.circle-dark')) {
                board[row][col] = 'destroyed';
                destroyedCount++;
            }
            // Check for previously tried cell (miss)
            else if (cell.querySelector('svg.intersection.no-hit') || cell.querySelector('.miss')) {
                board[row][col] = 'miss';
                missCount++;
            }
            // Check for hit
            else if (cell.querySelector('.hit.fire') || cell.querySelector('.hit.skull')) {
                board[row][col] = 'hit';
                hitCount++;
                newConfirmedHits.push({ row, col });
            }
            // Normal untried cell
            else if (cell.querySelector('svg.intersection:not(.no-hit)') || hasQuestionMark(cell)) {
                board[row][col] = 'available';
                availableCount++;
            }
        });

        confirmedHits = newConfirmedHits;

        // Reset game state if board is empty but we have internal history
        if (hitCount === 0 && missCount === 0 && destroyedCount === 0 && (totalHitsOnBoard > 0 || totalSunkCells > 0 || sunkShips.length > 0)) {
            console.log("Empty board detected. Resetting game state variables for new match.");
            remainingShips = [5, 4, 3, 3, 2];
            sunkShips = [];
            totalHitsOnBoard = 0;
            totalSunkCells = 0;
            confirmedHits = [];
        }

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

    // Function to update ship tracking based on board analysis
    function updateShipTracking(board) {
        let currentHits = 0;
        let currentSunk = 0;

        // Count current hits and sunk cells
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                if (board[row][col] === 'hit') currentHits++;
                if (board[row][col] === 'destroyed') currentSunk++;
            }
        }

        // If sunk cells increased, a ship was destroyed
        if (currentSunk > totalSunkCells) {
            const newSunkCells = currentSunk - totalSunkCells;

            // Try to determine which ship was sunk based on size
            // Find the largest remaining ship that matches the sunk size
            for (let i = 0; i < remainingShips.length; i++) {
                if (remainingShips[i] === newSunkCells) {
                    sunkShips.push(remainingShips[i]);
                    remainingShips.splice(i, 1);
                    console.log(`Ship of size ${newSunkCells} sunk! Remaining ships:`, remainingShips);
                    break;
                }
            }

            totalSunkCells = currentSunk;
            // Removed confirmedHits = []; to ensure remaining hits aren't ignored
        }

        totalHitsOnBoard = currentHits;

        return {
            remainingShips: remainingShips.slice(),
            sunkShips: sunkShips.slice(),
            totalHits: currentHits,
            totalSunk: currentSunk
        };
    }

    // Cluster confirmed hits into groups belonging to the same ship
    // Returns an array of clusters, each being an array of {row, col}
    function clusterHits(hits) {
        if (hits.length === 0) return [];

        const visited = new Set();
        const clusters = [];

        function getKey(r, c) { return `${r},${c}`; }
        const hitSet = new Set(hits.map(h => getKey(h.row, h.col)));

        for (const hit of hits) {
            const key = getKey(hit.row, hit.col);
            if (visited.has(key)) continue;

            // BFS to find all connected hits (cardinal directions only)
            const cluster = [];
            const queue = [hit];
            visited.add(key);

            while (queue.length > 0) {
                const current = queue.shift();
                cluster.push(current);

                const neighbors = [
                    { row: current.row - 1, col: current.col },
                    { row: current.row + 1, col: current.col },
                    { row: current.row, col: current.col - 1 },
                    { row: current.row, col: current.col + 1 }
                ];

                for (const n of neighbors) {
                    const nKey = getKey(n.row, n.col);
                    if (hitSet.has(nKey) && !visited.has(nKey)) {
                        visited.add(nKey);
                        queue.push(n);
                    }
                }
            }

            clusters.push(cluster);
        }

        return clusters;
    }

    // Advanced PDF (Probability Density Function) calculation
    function calculateProbabilityScore(row, col, board) {
        let totalProbability = 0;

        // Target Mode is strictly when there are known, unsunk hits on the board.
        const isTargetMode = confirmedHits.length > 0;

        // In target mode, focus on the largest hit cluster (most likely to be close to sinking)
        let targetClusterHits = confirmedHits;
        let knownOrientation = null;
        if (isTargetMode) {
            const clusters = clusterHits(confirmedHits);
            if (clusters.length > 0) {
                // Focus on the largest cluster first (closest to sinking a ship)
                clusters.sort((a, b) => b.length - a.length);
                targetClusterHits = clusters[0];
                knownOrientation = determineOrientation(targetClusterHits);
            }
        }

        // Only calculate probabilities for remaining ships
        remainingShips.forEach(shipSize => {
            // Check horizontal placements covering (row, col)
            for (let startCol = Math.max(0, col - shipSize + 1); startCol <= Math.min(9, col); startCol++) {
                if (startCol + shipSize <= 10) {
                    const weight = evaluatePlacement(row, startCol, shipSize, 'horizontal', board, isTargetMode, targetClusterHits, knownOrientation);
                    totalProbability += weight;
                }
            }

            // Check vertical placements covering (row, col)
            for (let startRow = Math.max(0, row - shipSize + 1); startRow <= Math.min(9, row); startRow++) {
                if (startRow + shipSize <= 10) {
                    const weight = evaluatePlacement(startRow, col, shipSize, 'vertical', board, isTargetMode, targetClusterHits, knownOrientation);
                    totalProbability += weight;
                }
            }
        });

        // If we are in Target Mode, we DO NOT care about hunt parity or guessing.
        // We only care about cells that can actually sink the ship.
        if (isTargetMode) {
            return totalProbability;
        }

        // Hunt Mode Optimization
        if (totalProbability > 0) {
            // Adaptive parity based on the smallest remaining ship ensures the AI covers the board optimally
            const minShipSize = remainingShips.length > 0 ? Math.min(...remainingShips) : 2;
            if ((row + col) % minShipSize === 0) {
                totalProbability *= 1.8; // Strong bonus to parity cells
            }

            // Improved center weighting: quadratic falloff rewarding the middle area
            const distFromCenter = Math.abs(row - 4.5) + Math.abs(col - 4.5);
            const centerBonus = Math.max(0, 1.0 - (distFromCenter / 9.0)); // 0.0 to 1.0
            totalProbability += centerBonus * centerBonus * 8; // Quadratic, max +8

            // Check if this cell has a question mark and add bonus score
            const cell = getCellByCoordinates(row, col);
            if (cell && hasQuestionMark(cell)) {
                totalProbability += 100; // Large bonus for question marks to prioritize them in hunt
            }
        }

        return totalProbability;
    }

    // Evaluates a specific ship placement and returns its probability weight
    function evaluatePlacement(startRow, startCol, shipSize, orientation, board, isTargetMode, clusterHits, knownOrientation) {
        let coversSunk = false;
        let coversMiss = false;
        let overlappedHits = 0;
        let overlapsCluster = 0;

        for (let i = 0; i < shipSize; i++) {
            const r = orientation === 'vertical' ? startRow + i : startRow;
            const c = orientation === 'horizontal' ? startCol + i : startCol;

            const cellState = board[r][c];
            if (cellState === 'miss') coversMiss = true;
            if (cellState === 'destroyed') coversSunk = true;
            if (cellState === 'hit') {
                overlappedHits++;
                // Check if this hit belongs to the focused cluster
                if (clusterHits && clusterHits.some(h => h.row === r && h.col === c)) {
                    overlapsCluster++;
                }
            }
        }

        // Invalid placements: overlaps misses or destroyed ships
        if (coversMiss || coversSunk) return 0;

        // Spacing Rules: check CARDINAL-adjacent cells for destroyed ships
        // Ships cannot be side-adjacent to confirmed sunken ships (diagonal is OK on papergames.io)
        for (let i = 0; i < shipSize; i++) {
            const r = orientation === 'vertical' ? startRow + i : startRow;
            const c = orientation === 'horizontal' ? startCol + i : startCol;

            // Check only 4 cardinal-adjacent cells for destroyed ships
            const adjacentPositions = [
                [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
            ];

            for (const [adjR, adjC] of adjacentPositions) {
                if (adjR >= 0 && adjR < 10 && adjC >= 0 && adjC < 10) {
                    if (board[adjR][adjC] === 'destroyed') {
                        return 0;
                    }
                }
            }
        }

        // Target Mode Logic
        if (isTargetMode) {
            // In Target Mode, a placement MUST cover at least one hit from the focused cluster.
            if (overlapsCluster === 0) return 0;

            // If we know the orientation strictly, placements orthogonal to it must be invalid
            if (knownOrientation && knownOrientation !== orientation) {
                return 0; // Strictly enforce targeting on the correct axis
            }

            // Exponential scaling: Placements that overlap more cluster hits are exponentially better.
            return Math.pow(10, overlapsCluster);
        }

        // Hunt Mode Logic
        return 1;
    }



    // Removed outdated handleAttackResult logic

    // Function to get adjacent cells with optional radius for probability calculations
    function getAdjacentCells(cell, radius = 1) {
        const [row, col] = getCellCoordinates(cell);
        let adjacentCells = [];

        if (radius === 1) {
            // Standard adjacent cells (up, down, left, right)
            adjacentCells.push(
                getCellByCoordinates(row - 1, col),
                getCellByCoordinates(row + 1, col),
                getCellByCoordinates(row, col - 1),
                getCellByCoordinates(row, col + 1)
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

    // Function to simulate a click on a cell
    function attackCell(cell) {
        if (cell) {
            cell.click();  // Simulate clicking the cell
            console.log('Attacked cell:', cell);
        }
    }

    let lastAttackTime = 0; // Track the last attack time

    // Function to check if a cell is a confirmed hit with skull
    function isHitWithSkull(cell) {
        return cell.querySelector('.hit.skull') !== null;
    }

    // Function to check if a cell has a question mark
    function hasQuestionMark(cell) {
        // First check if the cell has been resolved to a hit or miss
        const isHit = cell.querySelector('.hit.fire') || cell.querySelector('.hit.skull');
        const isMiss = cell.querySelector('.miss') || cell.querySelector('svg.intersection.no-hit');
        const isDestroyed = cell.querySelector('.magictime.opacityIn.ship-cell.circle-dark');

        // If the cell has been resolved, it's no longer a question mark
        if (isHit || isMiss || isDestroyed) {
            return false;
        }

        const hasGift = cell.querySelector('.gift.animated.tin-in') !== null;
        const hasGiftTaken = cell.querySelector('.gift-taken') !== null;
        const result = hasGift || hasGiftTaken;

        if (result) {
            const [row, col] = getCellCoordinates(cell);
            console.log(`Question mark found at [${row},${col}] - hasGift: ${hasGift}, hasGiftTaken: ${hasGiftTaken}`);
        }

        return result;
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
        if (confirmedHits.length >= 2) {
            const shipOrientation = determineOrientation(confirmedHits);
            let isAligned = false;

            if (shipOrientation && shipOrientation === 'horizontal') {
                // Check if question mark is in the same row as any confirmed hit
                for (const hit of confirmedHits) {
                    if (hit.row === row) {
                        isAligned = true;
                        break;
                    }
                }
            } else if (shipOrientation && shipOrientation === 'vertical') {
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

    // Helper function to get cell coordinates (removed duplicate - using the one above that checks data attributes first)

    // Helper function to get surrounding cells (8 directions)
    function getSurroundingCells(row, col) {
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
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
        // Find the opponent board first
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) return null;

        // Search through all cells to find the one with matching coordinates
        const cells = opponentBoard.querySelectorAll('td[class*="cell-"]');
        for (const cell of cells) {
            const [cellRow, cellCol] = getCellCoordinates(cell);
            if (cellRow === row && cellCol === col) {
                return cell;
            }
        }
        return null;
    }

    // Function to check if the game is in a ready state for an attack
    function isGameReady(username) {
        let opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) return false;

        // Verify it is actually our turn by checking if chronometer is on our profile
        const profileOpener = [...document.querySelectorAll(".text-truncate.cursor-pointer")].find(
            opener => opener.textContent.trim() === username
        );

        if (profileOpener) {
            const playerContainer = profileOpener.parentNode;
            if (playerContainer) {
                // Check if the visual chronometer is present
                if (playerContainer.querySelector('app-chronometer')) {
                    return true;
                }

                // Fallback: check if the timer span contains a valid countdown
                const spans = playerContainer.querySelectorAll("span");
                for (let i = 0; i < spans.length; i++) {
                    const text = spans[i].textContent.trim();
                    if (/^\d+$/.test(text)) {
                        return true; // We found the ticking seconds!
                    }
                }
            }
        }

        // Let's also check if opponent board has inactive class just in case UI changed
        return !opponentBoard.classList.contains('inactive') && !opponentBoard.closest('.inactive');
    }


    GM.getValue('username').then(function (username) {
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

        GM.getValue("username").then(function (username) {
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
            if (isGameReady(username)) {
                updateShipTracking(board);
                const bestCell = findBestProbabilityCell(board);
                if (bestCell) {
                    console.log("Selected optimal cell based on probability calculations");

                    // Get cell coordinates for weapon selection
                    const [row, col] = getCellCoordinates(bestCell);

                    // Build probability scores matrix for weapon selection
                    const probabilityScores = {};
                    for (let r = 0; r < 10; r++) {
                        probabilityScores[r] = {};
                        for (let c = 0; c < 10; c++) {
                            probabilityScores[r][c] = calculateProbabilityScore(r, c, board);
                        }
                    }

                    // Select optimal weapon before attacking
                    const optimalWeapon = selectOptimalWeapon(row, col, board, probabilityScores);
                    console.log(`Using weapon: ${optimalWeapon}`);

                    // Select and use the optimal weapon
                    selectAndUseWeapon(optimalWeapon);

                    // Small delay to ensure weapon selection is processed
                    setTimeout(() => {
                        attackCell(bestCell);
                    }, 100);
                } else {
                    // Fallback if no cells available based on probability, try random
                    const availableCells = getAvailableCells();
                    if (availableCells.length > 0) {
                        console.log("Fallback: attacking random cell.");
                        attackCell(availableCells[Math.floor(Math.random() * availableCells.length)]);
                    } else {
                        console.log("No valid cells found to attack at all!");
                    }
                }
            } else {
                // Not our turn, do nothing.
                // Turn validation ensures no async attacks trigger 'The targeted frame is already played'
            }
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
    window.toggleProbabilityVisualization = function () {
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
    // Accepts pre-computed board to avoid redundant analysis
    function findBestProbabilityCell(existingBoard) {
        const board = existingBoard || analyzeBoardState();
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) {
            console.log('Cannot find opponent board');
            return null;
        }

        let bestScore = -1;
        let candidates = []; // All cells tied for the best score

        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            // Only consider cells that haven't been attacked
            if ((cell.classList.contains('null') && cell.querySelector('svg.intersection:not(.no-hit)')) || hasQuestionMark(cell)) {
                const [row, col] = getCellCoordinates(cell);
                const score = calculateProbabilityScore(row, col, board);

                if (score > bestScore) {
                    bestScore = score;
                    candidates = [cell]; // New best — reset candidates
                } else if (score === bestScore && score > 0) {
                    candidates.push(cell); // Tie — add to candidates
                }
            }
        });

        if (candidates.length === 0) {
            console.log('No valid cells found');
            return null;
        }

        // Random tie-breaking: pick randomly among all cells with the same best score
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        const [sr, sc] = getCellCoordinates(selected);
        console.log(`Best score: ${bestScore.toFixed(1)} | Tie-break: selected [${sr},${sc}] randomly from ${candidates.length} candidates`);
        return selected;
    }

    // Function to check for error message and refresh if needed
    function checkForErrorAndRefresh() {
        const errorToast = document.querySelector('.toast-error .toast-message');
        if (errorToast) {
            const errorText = errorToast.textContent || "";
            if (errorText.includes('The targeted frame is already played')) {
                location.reload();
            } else if (errorText.includes('Not enough shoots for this weapon')) {
                console.log("Weapon ammo empty, falling back to default weapon...");
                selectAndUseWeapon('default');

                // Hide or click the toast to dismiss it so it doesn't block future checks
                const closeButton = errorToast.parentElement.querySelector('.toast-close-button');
                if (closeButton) {
                    closeButton.click();
                } else {
                    errorToast.parentElement.style.display = 'none';
                }
            }
        }
    }
    // Legacy functions removed - now using pure probability-based targeting





    // Auto queue functions
    function toggleAutoQueue() {
        // Toggle the state
        isAutoQueueOn = !isAutoQueueOn;
        GM.setValue('isToggled', isAutoQueueOn);

        // Update the button text and style based on the state
        autoQueueToggleButton.textContent = isAutoQueueOn ? 'Auto Queue On' : 'Auto Queue Off';
        autoQueueToggleButton.style.backgroundColor = isAutoQueueOn ? 'green' : 'red';
    }

    function clickLeaveRoomButton() {
        if (!isGameReady("dummy")) { // Avoid clicking 'Leave room' during active gameplay on our turn
            var buttons = document.querySelectorAll('span.front.text.btn.btn-light');
            for (let btn of buttons) {
                if (btn.textContent.trim() === 'Leave room') {
                    btn.click();
                    break;
                }
            }
        }
    }

    function clickPlayOnlineButton() {
        var buttons = document.querySelectorAll('span.front.text.btn.btn-secondary.btn-lg.text-start.juicy-btn-inner');
        for (let btn of buttons) {
            if (btn.textContent.includes('Play')) {
                btn.click();
                break;
            }
        }
    }

    // Periodically check for buttons when the toggle is on
    function checkButtonsPeriodically() {
        if (isAutoQueueOn) {
            clickPlayOnlineButton();
            // Leave room should only be clicked if the game is over
            const errorToast = document.querySelector('.toast-error .toast-message');
            const matchEnded = document.querySelector('.game-over-container'); // Look for generic game over indicators if possible
            clickLeaveRoomButton();
        }
    }

    // Create toggle buttons for probability visualization and auto queue
    function createToggleButton() {
        // Check if buttons already exist
        if (document.getElementById('probability-toggle')) return;

        // Probability toggle button
        const probButton = document.createElement('button');
        probButton.id = 'probability-toggle';
        probButton.textContent = 'Toggle Probability View';
        probButton.style.cssText = `
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

        probButton.addEventListener('click', function () {
            const enabled = window.toggleProbabilityVisualization();
            probButton.style.background = enabled ? '#4CAF50' : '#f44336';
            probButton.textContent = enabled ? 'Hide Probability View' : 'Show Probability View';
        });

        // Auto queue toggle button
        autoQueueToggleButton = document.createElement('button');
        autoQueueToggleButton.id = 'auto-queue-toggle';
        autoQueueToggleButton.textContent = 'Auto Queue Off';
        autoQueueToggleButton.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            z-index: 10000;
            padding: 8px 12px;
            background: red;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;

        autoQueueToggleButton.addEventListener('click', toggleAutoQueue);

        // Load saved auto queue state
        GM.getValue('isToggled', false).then(function (savedState) {
            isAutoQueueOn = savedState;
            autoQueueToggleButton.textContent = isAutoQueueOn ? 'Auto Queue On' : 'Auto Queue Off';
            autoQueueToggleButton.style.backgroundColor = isAutoQueueOn ? 'green' : 'red';
        });

        document.body.appendChild(probButton);
        document.body.appendChild(autoQueueToggleButton);
    }

    // Initialize toggle button when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createToggleButton);
    } else {
        createToggleButton();
    }

    // Set up periodic checking for auto queue
    setInterval(checkButtonsPeriodically, 1000);

    // Set interval to update the board regularly
    setInterval(updateBoard, 1000); // Check every second
})();
