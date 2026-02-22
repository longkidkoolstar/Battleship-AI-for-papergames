// ==UserScript==
// @name         Battleship AI for Papergames
// @namespace    github.io/longkidkoolstar
// @version      6.1.0
// @description  Unbeatable AI for Battleship on papergames.io with endgame solver, smart weapon AI, parallel multi-cluster targeting, and adaptive parity hunting
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

    // Get the hit pattern for a weapon type at a specific coordinate
    function getWeaponPattern(row, col, weaponType) {
        switch (weaponType) {
            case 'nuclear-bomb':
                // 3x3 square
                return [
                    [row, col],
                    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
                    [row - 1, col - 1], [row - 1, col + 1], [row + 1, col - 1], [row + 1, col + 1]
                ];
            case 'fragment-bomb':
                // target + 3 directly above
                return [
                    [row, col],
                    [row - 1, col], [row - 2, col], [row - 3, col]
                ];
            case 'missile':
                // cross shape
                return [
                    [row, col],
                    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
                ];
            default:
                return [[row, col]];
        }
    }

    // Evaluates the total PROBABILITY YIELD of a weapon fired at a specific coordinate
    function evaluateWeaponYield(row, col, weaponType, probabilityScores) {
        const pattern = getWeaponPattern(row, col, weaponType);
        return pattern.reduce((sum, [r, c]) => {
            if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                return sum + (probabilityScores[r][c] || 0);
            }
            return sum;
        }, 0);
    }

    // Advanced weapon analysis: counts new cells, wasted cells, and alignment with hits
    function analyzeWeaponShot(row, col, weaponType, board, probabilityScores) {
        const pattern = getWeaponPattern(row, col, weaponType);
        let probYield = 0;
        let newCells = 0;       // Untried cells the weapon will reveal
        let wastedCells = 0;    // Cells already hit/missed/destroyed/out-of-bounds
        let hitsOverlapped = 0; // Confirmed hits the weapon redundantly covers
        let totalCells = pattern.length;

        for (const [r, c] of pattern) {
            if (r < 0 || r >= 10 || c < 0 || c >= 10) {
                wastedCells++; // Off the board
                continue;
            }
            const state = board[r][c];
            if (state === 'unknown' || state === 'available') {
                newCells++;
                probYield += (probabilityScores[r][c] || 0);
            } else if (state === 'hit') {
                hitsOverlapped++;
                wastedCells++;
            } else {
                wastedCells++; // miss or destroyed
            }
        }

        const efficiency = totalCells > 0 ? newCells / totalCells : 0;

        return { probYield, newCells, wastedCells, hitsOverlapped, efficiency, totalCells };
    }

    // Nuclear bomb strategy: 3x3 area with corners
    function shouldUseNuclearBomb(targetRow, targetCol, board, probabilityScores, gameProgress) {
        const yieldValue = evaluateWeaponYield(targetRow, targetCol, 'nuclear-bomb', probabilityScores);
        const cellValue = probabilityScores[targetRow][targetCol] || 1;

        // Use early game if an incredible quadrant density exists
        if (gameProgress < 0.3) {
            return yieldValue > 150; // Lowered from 250 to make it more likely to fire early if grouped
        }

        // Mid-late game: Ensure the absolute yield is at least 2.5x better than a single-target strike
        return yieldValue >= cellValue * 2.5 && yieldValue > 100; // Lowered from 3.0x and 150
    }

    // Fragment bomb strategy: 4 vertical hits
    function shouldUseFragmentBomb(targetRow, targetCol, board, probabilityScores, gameProgress) {
        const yieldValue = evaluateWeaponYield(targetRow, targetCol, 'fragment-bomb', probabilityScores);
        const cellValue = probabilityScores[targetRow][targetCol] || 1;

        // We want strict, surgically dense vertical probability arrays.
        return yieldValue >= cellValue * 1.5 && yieldValue > 50; // Lowered from 2.0x and 100
    }

    // Missile strategy: 5 hits in plus pattern
    function shouldUseMissile(targetRow, targetCol, board, hasConfirmedHits, probabilityScores) {
        const yieldValue = evaluateWeaponYield(targetRow, targetCol, 'missile', probabilityScores);
        const cellValue = probabilityScores[targetRow][targetCol] || 1;

        if (hasConfirmedHits) {
            // If hits are active on the board, we already use strict targeting overlay
            // Require just a minor bump in yield to finish a ship faster.
            return yieldValue >= cellValue * 1.1 && yieldValue > 15; // Lowered from 1.2x and 25
        }

        // Just >1.3x return is good enough for a missile to explore the board wildly
        return yieldValue >= cellValue * 1.3 && yieldValue > 25; // Lowered from 1.5x and 50
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

    // Find the best parity class: the one with the most untried cells on the board
    function findBestParityClass(board, minShipSize) {
        if (minShipSize <= 1) return 0;
        const counts = new Array(minShipSize).fill(0);
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                if (board[r][c] === 'unknown' || board[r][c] === 'available') {
                    counts[(r + c) % minShipSize]++;
                }
            }
        }
        let bestClass = 0;
        let bestCount = -1;
        for (let i = 0; i < counts.length; i++) {
            if (counts[i] > bestCount) {
                bestCount = counts[i];
                bestClass = i;
            }
        }
        return bestClass;
    }

    // Advanced PDF (Probability Density Function) calculation
    function calculateProbabilityScore(row, col, board) {
        // Immediate rejection: cell already played
        const cellState = board[row][col];
        if (cellState === 'miss' || cellState === 'destroyed' || cellState === 'hit') return 0;

        // Adjacency elimination: cells cardinal-adjacent to destroyed ships cannot hold a ship
        const cardinals = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];
        for (const [r, c] of cardinals) {
            if (r >= 0 && r < 10 && c >= 0 && c < 10 && board[r][c] === 'destroyed') {
                return 0; // Provably empty — ships can't touch cardinally on papergames.io
            }
        }

        let totalProbability = 0;

        // Target Mode is strictly when there are known, unsunk hits on the board.
        const isTargetMode = confirmedHits.length > 0;

        if (isTargetMode) {
            // PARALLEL MULTI-CLUSTER TARGETING:
            // Instead of only focusing on the largest cluster, accumulate probability
            // from ALL clusters. This lets the AI work on multiple ships simultaneously
            // and naturally prioritize cells that could belong to any unsunk ship.
            const clusters = clusterHits(confirmedHits);

            for (const cluster of clusters) {
                const clusterOrientation = determineOrientation(cluster);

                remainingShips.forEach(shipSize => {
                    // Horizontal placements covering (row, col)
                    for (let startCol = Math.max(0, col - shipSize + 1); startCol <= Math.min(9, col); startCol++) {
                        if (startCol + shipSize <= 10) {
                            const weight = evaluatePlacement(row, startCol, shipSize, 'horizontal', board, true, cluster, clusterOrientation);
                            totalProbability += weight;
                        }
                    }
                    // Vertical placements covering (row, col)
                    for (let startRow = Math.max(0, row - shipSize + 1); startRow <= Math.min(9, row); startRow++) {
                        if (startRow + shipSize <= 10) {
                            const weight = evaluatePlacement(startRow, col, shipSize, 'vertical', board, true, cluster, clusterOrientation);
                            totalProbability += weight;
                        }
                    }
                });
            }

            return totalProbability;
        }

        // Hunt Mode: calculate probabilities for remaining ships
        remainingShips.forEach(shipSize => {
            for (let startCol = Math.max(0, col - shipSize + 1); startCol <= Math.min(9, col); startCol++) {
                if (startCol + shipSize <= 10) {
                    const weight = evaluatePlacement(row, startCol, shipSize, 'horizontal', board, false, null, null);
                    totalProbability += weight;
                }
            }
            for (let startRow = Math.max(0, row - shipSize + 1); startRow <= Math.min(9, row); startRow++) {
                if (startRow + shipSize <= 10) {
                    const weight = evaluatePlacement(startRow, col, shipSize, 'vertical', board, false, null, null);
                    totalProbability += weight;
                }
            }
        });

        // Hunt Mode Optimization
        if (totalProbability > 0) {
            // Adaptive parity cycling: pick the parity class with the most untried cells
            const minShipSize = remainingShips.length > 0 ? Math.min(...remainingShips) : 2;
            const bestParityClass = findBestParityClass(board, minShipSize);
            if ((row + col) % minShipSize === bestParityClass) {
                totalProbability *= 2.5; // Strong bonus to optimal parity cells
            } else {
                totalProbability *= 0.05; // Strict penalty to non-parity cells
            }

            // Center bias REMOVED — the ship-fit enumeration above already naturally
            // gives higher scores to center cells (more placements pass through them).
            // Adding an artificial center bonus introduces noise and suboptimal edge shots.

            // Question mark bonus for hunt mode
            const cell = getCellByCoordinates(row, col);
            if (cell && hasQuestionMark(cell)) {
                totalProbability += 100;
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

            // Exponential scaling: Placements that overlap more cluster hits (and other hits) are exponentially better.
            return Math.pow(10, overlappedHits);
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

    // ===== ENDGAME EXHAUSTIVE SOLVER =====
    // When few ships remain and the board is mostly revealed, enumerate ALL valid
    // fleet configurations to compute exact per-cell probabilities.
    function isEndgameEligible(board) {
        let availableCells = 0;
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                if (board[r][c] === 'unknown' || board[r][c] === 'available' || board[r][c] === 'hit') {
                    availableCells++;
                }
            }
        }
        // Activate solver when ≤2 ships remain and <30 open cells (keeps computation fast)
        return remainingShips.length <= 2 && availableCells < 30;
    }

    // Check if a single ship placement is valid on the board
    function isValidPlacement(startRow, startCol, size, orientation, board) {
        for (let i = 0; i < size; i++) {
            const r = orientation === 'vertical' ? startRow + i : startRow;
            const c = orientation === 'horizontal' ? startCol + i : startCol;
            if (r < 0 || r >= 10 || c < 0 || c >= 10) return false;
            const state = board[r][c];
            if (state === 'miss' || state === 'destroyed') return false;
            // Check cardinal adjacency to destroyed ships
            const adj = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
            for (const [ar, ac] of adj) {
                if (ar >= 0 && ar < 10 && ac >= 0 && ac < 10 && board[ar][ac] === 'destroyed') return false;
            }
        }
        return true;
    }

    // Get all cells occupied by a placement
    function getPlacementCells(startRow, startCol, size, orientation) {
        const cells = [];
        for (let i = 0; i < size; i++) {
            cells.push({
                row: orientation === 'vertical' ? startRow + i : startRow,
                col: orientation === 'horizontal' ? startCol + i : startCol
            });
        }
        return cells;
    }

    // Check if a placement covers all required hits and doesn't conflict with other placements
    function placementCoversHits(cells, board) {
        // A valid placement can cover 'hit', 'unknown', or 'available' cells
        // It MUST be consistent with hits (a hit cell must be covered by some ship)
        return true; // Individual placement validity already checked
    }

    // Endgame solver: enumerate all valid configurations of remaining ships
    function endgameSolve(board) {
        console.log('=== ENDGAME SOLVER ACTIVATED ===');
        console.log(`Remaining ships: [${remainingShips.join(',')}]`);

        // Generate all valid placements per ship
        const allPlacements = [];
        for (let idx = 0; idx < remainingShips.length; idx++) {
            const size = remainingShips[idx];
            const placements = [];
            for (let r = 0; r < 10; r++) {
                for (let c = 0; c < 10; c++) {
                    for (const orient of ['horizontal', 'vertical']) {
                        const endR = orient === 'vertical' ? r + size - 1 : r;
                        const endC = orient === 'horizontal' ? c + size - 1 : c;
                        if (endR >= 10 || endC >= 10) continue;
                        if (isValidPlacement(r, c, size, orient, board)) {
                            placements.push({ startRow: r, startCol: c, size, orientation: orient, cells: getPlacementCells(r, c, size, orient) });
                        }
                    }
                }
            }
            allPlacements.push(placements);
            console.log(`Ship size ${size}: ${placements.length} valid placements`);
        }

        // Collect all hit cells that must be covered
        const hitCells = [];
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                if (board[r][c] === 'hit') hitCells.push(`${r},${c}`);
            }
        }
        const hitSet = new Set(hitCells);

        // Count valid configurations per cell
        const cellCounts = Array(10).fill(null).map(() => Array(10).fill(0));
        let totalConfigs = 0;

        // For 1 ship: simple enumeration
        if (remainingShips.length === 1) {
            for (const p of allPlacements[0]) {
                // Check this placement covers all known hits
                const coveredCells = new Set(p.cells.map(c => `${c.row},${c.col}`));
                let coversAllHits = true;
                for (const h of hitCells) {
                    if (!coveredCells.has(h)) { coversAllHits = false; break; }
                }
                if (!coversAllHits) continue;

                totalConfigs++;
                for (const cell of p.cells) {
                    cellCounts[cell.row][cell.col]++;
                }
            }
        }
        // For 2 ships: enumerate all non-overlapping pairs
        else if (remainingShips.length === 2) {
            for (const p1 of allPlacements[0]) {
                const p1Set = new Set(p1.cells.map(c => `${c.row},${c.col}`));
                // Check cardinal adjacency between ships is not needed since
                // each placement already checks adjacency to destroyed cells.
                // But ships CAN be adjacent to each other (only destroyed ships can't touch).

                for (const p2 of allPlacements[1]) {
                    // Check no overlap
                    let overlaps = false;
                    for (const cell of p2.cells) {
                        if (p1Set.has(`${cell.row},${cell.col}`)) { overlaps = true; break; }
                    }
                    if (overlaps) continue;

                    // Check that together they cover ALL known hits
                    const combinedSet = new Set([...p1Set, ...p2.cells.map(c => `${c.row},${c.col}`)]);
                    let coversAllHits = true;
                    for (const h of hitCells) {
                        if (!combinedSet.has(h)) { coversAllHits = false; break; }
                    }
                    if (!coversAllHits) continue;

                    totalConfigs++;
                    for (const cell of p1.cells) cellCounts[cell.row][cell.col]++;
                    for (const cell of p2.cells) cellCounts[cell.row][cell.col]++;
                }
            }
        }

        console.log(`Endgame solver found ${totalConfigs} valid configurations`);

        if (totalConfigs === 0) {
            console.log('No valid configurations found, falling back to heuristic');
            return null; // Fall back to normal probability
        }

        // Normalize to probabilities
        const probabilities = Array(10).fill(null).map(() => Array(10).fill(0));
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                probabilities[r][c] = (cellCounts[r][c] / totalConfigs) * 1000; // Scale for consistency
            }
        }

        return probabilities;
    }

    // ===== SMART WEAPON SELECTION =====
    // Weapon-aware target selection with deep analysis of weapon effectiveness.
    // Evaluates: probability yield, NEW cell coverage, efficiency (% useful cells),
    // ammo conservation, and tactical alignment with unsunk ships.
    function findBestCellAndWeapon(board, probabilityScores) {
        detectAvailableWeapons();
        const opponentBoard = document.querySelector('.opponent app-battleship-board table');
        if (!opponentBoard) return { bestCell: null, bestWeapon: 'default' };

        const gameProgress = (totalSunkCells + totalHitsOnBoard) / 17;
        const hasHits = confirmedHits.length > 0;

        // Total weapons remaining — used to scale aggressiveness
        const totalWeaponsLeft = availableWeapons.missile + availableWeapons.fragmentBomb + availableWeapons.nuclearBomb;

        // Count untried cells on the board to gauge how much of the board is left
        let untriedCellCount = 0;
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                if (board[r][c] === 'unknown' || board[r][c] === 'available') untriedCellCount++;
            }
        }

        let bestScore = -1;
        let bestCell = null;
        let bestWeapon = 'default';
        let candidates = [];

        // Determine which weapons are available for evaluation
        const weaponsToEval = ['default'];
        if (availableWeapons.missile > 0) weaponsToEval.push('missile');
        if (availableWeapons.fragmentBomb > 0) weaponsToEval.push('fragment-bomb');
        if (availableWeapons.nuclearBomb > 0) weaponsToEval.push('nuclear-bomb');

        opponentBoard.querySelectorAll('td[class*="cell-"]').forEach(cell => {
            if ((cell.classList.contains('null') && cell.querySelector('svg.intersection:not(.no-hit)')) || hasQuestionMark(cell)) {
                const [row, col] = getCellCoordinates(cell);
                const cellProb = probabilityScores[row][col];
                if (cellProb <= 0) return;

                for (const weapon of weaponsToEval) {
                    let effectiveScore;

                    if (weapon === 'default') {
                        effectiveScore = cellProb;
                    } else {
                        const analysis = analyzeWeaponShot(row, col, weapon, board, probabilityScores);

                        // RULE 1: Don't waste weapons if too many cells are off-board or already played
                        // Require at least 50% of the weapon's cells to hit new territory
                        if (analysis.efficiency < 0.5) {
                            effectiveScore = -1;
                        }
                        // RULE 2: Weapon-specific smart thresholds
                        else {
                            let worthUsing = false;

                            if (weapon === 'nuclear-bomb') {
                                // Nuke needs at least 5 new cells to be worth using (out of 9)
                                // Aggressiveness scales with ammo: if we have multiple, use more freely
                                const nukeAmmo = availableWeapons.nuclearBomb;
                                const newCellThreshold = nukeAmmo > 1 ? 4 : 5;
                                const yieldThreshold = nukeAmmo > 1 ? 80 : 120;
                                worthUsing = analysis.newCells >= newCellThreshold &&
                                             analysis.probYield > yieldThreshold &&
                                             analysis.probYield >= cellProb * 2.0;
                            }
                            else if (weapon === 'fragment-bomb') {
                                // Fragment bomb: 4 vertical cells, need at least 3 new
                                const fragAmmo = availableWeapons.fragmentBomb;
                                const newCellThreshold = fragAmmo > 1 ? 2 : 3;
                                worthUsing = analysis.newCells >= newCellThreshold &&
                                             analysis.probYield >= cellProb * 1.3 &&
                                             analysis.probYield > 40;
                            }
                            else if (weapon === 'missile') {
                                // Missile: 5 cells in cross. Best used when:
                                // - In target mode to rapidly extend around a hit
                                // - In hunt mode when center cells have high probability
                                const missileAmmo = availableWeapons.missile;
                                if (hasHits) {
                                    // In target mode: use missiles freely to finish ships fast
                                    // Even 2 new cells is fine if the yield is good
                                    worthUsing = analysis.newCells >= 2 &&
                                                 analysis.probYield >= cellProb * 1.05 &&
                                                 analysis.probYield > 10;
                                } else {
                                    // Hunt mode: need better efficiency
                                    const newCellThreshold = missileAmmo > 2 ? 3 : 4;
                                    worthUsing = analysis.newCells >= newCellThreshold &&
                                                 analysis.probYield >= cellProb * 1.2 &&
                                                 analysis.probYield > 20;
                                }
                            }

                            // RULE 3: With lots of ammo remaining, be more aggressive
                            // If we have > 3 total weapons, lower thresholds across the board
                            if (!worthUsing && totalWeaponsLeft > 3 && analysis.newCells >= 3 && analysis.probYield > cellProb * 1.1) {
                                worthUsing = true;
                                console.log(`Aggressive weapon use: ${weapon} at [${row},${col}] due to high ammo (${totalWeaponsLeft} left)`);
                            }

                            // RULE 4: In endgame with small board left, use remaining weapons liberally
                            if (!worthUsing && untriedCellCount < 20 && analysis.newCells >= 2 && analysis.probYield > cellProb) {
                                worthUsing = true;
                                console.log(`Endgame weapon use: ${weapon} at [${row},${col}] (${untriedCellCount} cells left)`);
                            }

                            // Score = probability yield weighted by efficiency
                            effectiveScore = worthUsing ? analysis.probYield * analysis.efficiency : -1;
                        }
                    }

                    if (effectiveScore > bestScore) {
                        bestScore = effectiveScore;
                        bestCell = cell;
                        bestWeapon = weapon;
                        candidates = [{ cell, weapon }];
                    } else if (effectiveScore === bestScore && effectiveScore > 0) {
                        candidates.push({ cell, weapon });
                    }
                }
            }
        });

        // Random tie-breaking among equally scored (cell, weapon) pairs
        if (candidates.length > 1) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            bestCell = pick.cell;
            bestWeapon = pick.weapon;
        }

        if (bestCell) {
            const [r, c] = getCellCoordinates(bestCell);
            console.log(`Smart weapon selection: [${r},${c}] with ${bestWeapon} (score: ${bestScore.toFixed(1)}, ${candidates.length} tied)`);
        }

        return { bestCell, bestWeapon };
    }

    // Main attack system with weapon-aware targeting
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

            // Check for error message first and see if we need to force a default weapon shot
            let forceDefaultWeapon = checkForErrorAndRefresh();

            // Use weapon-aware probability-based targeting
            if (isGameReady(username)) {
                updateShipTracking(board);

                // Try endgame solver first for exact probabilities
                let probabilityScores;
                const endgameProbs = isEndgameEligible(board) ? endgameSolve(board) : null;

                if (endgameProbs) {
                    // Use exact endgame probabilities
                    probabilityScores = {};
                    for (let r = 0; r < 10; r++) {
                        probabilityScores[r] = {};
                        for (let c = 0; c < 10; c++) {
                            probabilityScores[r][c] = endgameProbs[r][c];
                        }
                    }
                    console.log('Using ENDGAME SOLVER exact probabilities');
                } else {
                    // Build heuristic probability matrix
                    probabilityScores = {};
                    for (let r = 0; r < 10; r++) {
                        probabilityScores[r] = {};
                        for (let c = 0; c < 10; c++) {
                            probabilityScores[r][c] = calculateProbabilityScore(r, c, board);
                        }
                    }
                }

                let selectedCell, selectedWeapon;

                if (forceDefaultWeapon) {
                    console.log("Bypassing weapon selection: forcing default weapon due to ammo error");
                    selectedCell = findBestProbabilityCell(board);
                    selectedWeapon = 'default';
                } else {
                    // Smart weapon-aware targeting: pick optimal (cell, weapon) pair
                    const result = findBestCellAndWeapon(board, probabilityScores);
                    selectedCell = result.bestCell;
                    selectedWeapon = result.bestWeapon;
                }

                if (selectedCell) {
                    const [row, col] = getCellCoordinates(selectedCell);
                    console.log(`Attacking [${row},${col}] with weapon: ${selectedWeapon}`);

                    selectAndUseWeapon(selectedWeapon);

                    setTimeout(() => {
                        attackCell(selectedCell);
                    }, 100);
                } else {
                    // Fallback if no cells available based on probability
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
                return true;
            }
        }
        return false;
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
