import RaceBox from './RaceBox';
import PartyManager from './PartyManager';
import {useContext, useEffect} from "react";
import Typewriter from 'typewriter-effect/dist/core';
import {WebSocketContext} from "./WebSocketContext.jsx";

function HomePage() {
    const { isConnected } = useContext(WebSocketContext);
    useEffect(() => {
        if (isConnected) {
            document.getElementById('typewriter').style.color = `#${Math.floor(Math.random() * 16777215).toString(16)}`;

            const typewriter = new Typewriter('#typewriter', {
                loop: false,
                cursor: ''
            });

            typewriter
                .typeString('Tempest Type')
                .callFunction(() => {
                    const typewriterEl = document.getElementById('typewriter');
                    if (typewriterEl) {
                        const wrapper = document.createElement('span');
                        wrapper.style.display = 'inline-flex';
                        wrapper.style.alignItems = 'center';
                        wrapper.style.gap = '8px';

                        const img = document.createElement('img');
                        img.src = '/wind.svg';
                        img.alt = 'Wind Icon';
                        img.style.width = '64px';
                        img.style.height = '64px';
                        img.style.verticalAlign = 'middle';
                        img.style.marginLeft = '32px';

                        wrapper.innerHTML = 'Tempest Type';
                        wrapper.appendChild(img);
                        typewriterEl.innerHTML = '';
                        typewriterEl.appendChild(wrapper);
                    }
                })
                .start();
        }
    }, [isConnected]);

    return (
        <div className="container">
            <a href="/"><div className="typewriter" id="typewriter"></div></a>
            <RaceBox />
            <PartyManager />
        </div>
    );
}

export default HomePage;