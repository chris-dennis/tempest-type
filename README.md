https://tempesttype.xyz


A real-time multiplayer typing race application where users can compete to see who types the fastest.


Features


Multiplayer Racing: Create or join typing competitions with friends
Real-time Progress Tracking: See other racers' progress as they type
Party System: Create and join parties with a simple code system
Persistence: User statistics are saved between sessions
Global Leaderboard: View the fastest typists and their speeds
Accessibility Options: Customize the interface to your preferences
Live Cursor Positions: See where other players are in the typing prompt in real-time


Tech Stack


Backend


Rust with Actix-web framework
WebSockets for real-time communication
PostgreSQL database for data persistence
SQLx for database interactions


Frontend


React with Vite for fast development
React Router for navigation
Context API for state management
WebSockets for real-time updates


Getting Started


Prerequisites


Rust 1.70+
Node.js 18+
PostgreSQL 14+


Database Setup


Create a PostgreSQL database
Create the following tables:

users - User information
user_stats - User typing statistics
race_results - Record of all race results
parties - Party information




Environment Variables

Create a .env file in the backend directory with the following:


DATABASE_URL=postgres://username:password@localhost/tempest_type



Starting the Backend


cd backend
cargo run



Starting the Frontend


cd frontend
npm install
npm run dev



Usage




Create or Join a Party:


Click "Create Party" to start your own race room
Enter a party code and click "Join Party" to join an existing race




Start Racing:


The party leader can start a race
A random prompt will appear, and a countdown will begin
The prompt can be cleared and a new one can be requested at any time
Type the text accurately and quickly to win




Track Your Progress:


View your statistics (races completed, races won, average WPM, top WPM)
Check the global leaderboard to see how you rank




Customize Your Experience:


Click the gear icon to access accessibility settings
Customize colors, font, and highlighting preferences
