# Battleship AI for Paper Games 🚢🤖

An advanced AI assistant for the classic Battleship game on [papergames.io](https://papergames.io). This userscript implements sophisticated probability calculations, strategic weapon selection, and intelligent targeting to give you the competitive edge in naval warfare.

## 🎯 Features

### Core AI Engine
- **Bayesian Probability System**: Calculates optimal target locations using advanced probability theory
- **Dynamic Strategy Adjustment**: Adapts tactics based on game progress and remaining ships
- **Pattern Recognition**: Identifies ship placement patterns and adjusts targeting accordingly

### Strategic Weapon Selection
- **Missile System**: 5-cell cross pattern targeting for confirmed hits and early exploration
- **Fragment Bomb**: 4-cell cluster targeting for high-probability areas
- **Nuclear Bomb**: 9-cell area coverage (3×3 grid) for maximum impact
- **Smart Weapon Detection**: Automatically detects available weapons and their quantities

### Advanced Targeting
- **Probability Visualization**: Color-coded heatmap showing hit probability for each cell
- **Ship Tracking**: Monitors remaining ships and adjusts targeting strategy
- **Hit Confirmation System**: Tracks confirmed hits and uses them to inform future moves
- **Question Mark Targeting**: Intelligently targets cells marked with question marks

### Quality of Life Features
- **Auto-Queue System**: Automatically queues moves for faster gameplay
- **Real-time Statistics**: Displays current game progress and weapon availability
- **Debug Console**: Comprehensive logging for strategy analysis
- **Toggle Controls**: Easy enable/disable for all major features

## 🚀 Installation

### Prerequisites
- A userscript manager (recommended: [Tampermonkey](https://www.tampermonkey.net/) or [Greasemonkey](https://www.greasespot.net/))
- Modern web browser (Chrome, Firefox, Edge, Safari)

### Steps
1. Install a userscript manager extension for your browser
2. Click on the userscript manager icon and select "Create new script"
3. Copy and paste the contents of `Battleship AI for Papergames.user.js`
4. Save the script (Ctrl+S or Cmd+S)
5. Navigate to [papergames.io](https://papergames.io) and start a Battleship game

## 🎮 How to Use

### Basic Usage
1. Start a new Battleship game on papergames.io
2. The AI will automatically activate when it's your turn
3. Watch the probability visualization appear on the opponent's board
4. The AI will make optimal moves based on current game state

### Advanced Controls
- **Probability Toggle**: Click the "Toggle Visualization" button to show/hide probability heatmaps
- **Auto-Queue**: Enable/disable automatic move queuing with the "Toggle Auto Queue" button
- **Manual Override**: You can still make manual moves at any time - the AI will adapt

### Understanding the Interface

#### Probability Visualization
- **Red cells**: Highest probability of containing a ship
- **Orange cells**: Medium probability
- **Yellow cells**: Lower probability
- **Blue cells**: Recently targeted (avoided in next moves)

#### Weapon Indicators
- **Missile**: Available when you see the missile icon with a count > 0
- **Fragment Bomb**: Available when you see the fragment-bomb icon with a count > 0
- **Nuclear Bomb**: Available when you see the nuclear-bomb icon with a count > 0

## 🧠 Strategy Breakdown

### Early Game (0-20% progress)
- Focuses on maximum board coverage
- Uses missiles for efficient exploration
- Avoids nuclear bombs to preserve for later

### Mid Game (20-60% progress)
- Shifts to targeted hunting based on confirmed hits
- Strategic use of fragment bombs for cluster targeting
- Begins nuclear bomb consideration for high-value areas

### Late Game (60%+ progress)
- Aggressive hunting with all available weapons
- Nuclear bombs for finishing damaged ships
- Missiles for precise targeting of remaining cells

### Weapon Selection Logic

#### Missile Usage Criteria
- Near confirmed hits with good coverage
- Early game exploration with excellent coverage
- Question mark targeting with 3+ cell coverage
- Maximum 5-cell coverage scenarios

#### Fragment Bomb Usage Criteria
- Near confirmed hits for surrounding area clearance
- High probability cross patterns (16+ combined probability)
- Full 4-cell coverage requirement

#### Nuclear Bomb Usage Criteria
- Early game: Only for nearly full coverage (8+ unknown cells)
- Late game: Very high probability clusters (20+ combined probability)
- Finishing moves on damaged ships

## 🔧 Technical Details

### Architecture
- **Language**: JavaScript (ES6+)
- **Framework**: Vanilla JavaScript with DOM manipulation
- **Storage**: GM.setValue/GM.getValue for persistent settings
- **Target Platform**: papergames.io Battleship game interface

### Key Components
- **Probability Engine**: Calculates hit probabilities using Bayesian inference
- **Weapon Selector**: Determines optimal weapon based on game state
- **Board Analyzer**: Parses and analyzes the game board state
- **Move Executor**: Interfaces with the game UI to make moves

### Performance Optimizations
- **Efficient DOM Querying**: Minimizes expensive DOM operations
- **Smart Caching**: Caches probability calculations between moves
- **Debounced Updates**: Prevents excessive recalculations
- **Memory Management**: Proper cleanup of event listeners and intervals

## 🐛 Troubleshooting

### Common Issues

#### AI Not Activating
- **Solution**: Refresh the page and ensure the userscript is enabled
- **Check**: Look for console messages indicating successful initialization

#### Probability Visualization Not Appearing
- **Solution**: Click "Toggle Visualization" button
- **Check**: Ensure the game board is fully loaded before the AI activates

#### Weapons Not Being Used
- **Solution**: Check weapon availability in the game interface
- **Note**: The AI only uses weapons when they're actually available in-game

### Debug Information
Access browser console (F12) to see detailed logs including:
- Weapon detection status
- Probability calculations
- Move decision rationale
- Performance metrics

## 📊 Statistics and Metrics

The AI tracks and displays:
- **Game Progress**: Percentage of total ship cells found
- **Remaining Ships**: Count and size of undiscovered ships
- **Weapon Inventory**: Real-time availability of special weapons
- **Hit Rate**: Success rate of targeting decisions

## 🔄 Updates and Maintenance

### Version History
- **v4.1.9**: Latest stable release with full weapon support
- **v4.x Series**: Major weapon system overhaul
- **v3.x Series**: Probability engine improvements
- **v2.x Series**: Basic AI implementation
- **v1.x Series**: Initial concept and framework

### Future Enhancements
- Machine learning integration for pattern recognition
- Advanced ship placement prediction
- Multi-game statistical analysis
- Custom strategy configuration options

## ⚖️ Legal and Ethical Considerations

### Terms of Service
This userscript is designed to enhance gameplay experience on papergames.io. Users should:
- Respect the platform's terms of service
- Use the AI for educational and entertainment purposes
- Not use for competitive tournaments unless explicitly allowed

### Fair Play
The AI provides strategic assistance but does not:
- Access hidden game data
- Exploit game mechanics
- Provide unfair advantages beyond strategic guidance

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Install Tampermonkey for development
3. Load the userscript in development mode
4. Test changes on papergames.io

### Reporting Issues
- Use GitHub Issues for bug reports
- Include browser version and userscript manager
- Provide console logs for debugging
- Include steps to reproduce the issue

### Feature Requests
- Open a GitHub Issue with the "enhancement" label
- Describe the proposed feature and its benefits
- Consider the impact on game balance

## 📄 License

This project is open source and available under the MIT License. See LICENSE file for details.

## 🙏 Acknowledgments

- **papergames.io** for providing the Battleship platform
- **Tampermonkey** team for the excellent userscript manager
- **Battleship community** for feedback and testing

---

**Note**: This is a demonstration project showcasing AI concepts in gaming. While functional, it's designed as a proof of concept rather than a production-grade gaming assistant. Future updates may include true AI implementation using machine learning techniques.

For questions, issues, or contributions, please visit the [GitHub repository](https://github.com/longkidkoolstar/Battleship-AI-for-papergames).
 
