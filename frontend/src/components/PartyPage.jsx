import { useEffect } from 'react';
import RaceBox from './RaceBox';
import PartyManager from './PartyManager';

function PartyPage() {
    useEffect(() => {
        const typewriterEl = document.getElementById('typewriter');
        if (typewriterEl && typewriterEl.children.length === 0) {
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
    }, []);

    return (
        <div className="container">
            <a href="/"><div className="typewriter" id="typewriter"></div></a>
            <RaceBox />
            <PartyManager />
        </div>
    );
}

export default PartyPage;
