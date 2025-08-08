import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";

// --- TYPES ---
type TaskType = 'multipleChoice' | 'freeText' | 'math' | 'coding' | 'rolePlay';
type View = 'setup' | 'simulation' | 'loading' | 'error';

interface Task {
    description: string;
    question: string;
    taskType: TaskType;
    options?: string[];
    skills: string[]; // Changed from 'disciplines'
    character?: string; // For rolePlay tasks
}

interface HistoryItem {
    task: Task;
    answer: string;
    feedback?: string;
    timestamp: number;
}

interface InventoryItem {
    name: string;
    description: string;
    sourceTaskIndex: number;
}

// --- MAIN APP COMPONENT ---
const App = () => {
    // --- STATE MANAGEMENT ---
    const [view, setView] = useState<View>('setup');
    const [scenario, setScenario] = useState('');
    const [duration, setDuration] = useState('1 year');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [skills, setSkills] = useState<Record<string, number>>({}); // Changed from 'stats'
    const [isMindModelOpen, setMindModelOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [userAnswer, setUserAnswer] = useState('');
    const [userFeedback, setUserFeedback] = useState('');
    const [isDiving, setIsDiving] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [performanceAnalysis, setPerformanceAnalysis] = useState('');

    const aiRef = useRef<GoogleGenAI | null>(null);
    const chatRef = useRef<Chat | null>(null);

    // --- LOCAL STORAGE PERSISTENCE ---
    useEffect(() => {
        try {
            const savedState = localStorage.getItem('lifeSimState');
            if (savedState) {
                const { scenario, duration, tasks, currentTaskIndex, history, inventory, skills, performanceAnalysis } = JSON.parse(savedState);
                if (tasks.length > 0) {
                    setScenario(scenario);
                    setDuration(duration);
                    setTasks(tasks);
                    setCurrentTaskIndex(currentTaskIndex);
                    setHistory(history);
                    setInventory(inventory);
                    setSkills(skills); // Changed from setStats
                    setPerformanceAnalysis(performanceAnalysis || '');
                    setView('simulation');
                }
            }
        } catch (error) {
            console.error("Failed to load state from localStorage", error);
        }
    }, []);

    useEffect(() => {
        if (view === 'simulation') {
            const stateToSave = { scenario, duration, tasks, currentTaskIndex, history, inventory, skills, performanceAnalysis };
            localStorage.setItem('lifeSimState', JSON.stringify(stateToSave));
        }
    }, [scenario, duration, tasks, currentTaskIndex, history, inventory, skills, performanceAnalysis, view]);


    // --- AI INITIALIZATION ---
    useEffect(() => {
        try {
            if (process.env.API_KEY) {
                aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
            } else {
                throw new Error("API_KEY environment variable not found.");
            }
        } catch (error: any) {
            setErrorMessage("Failed to initialize AI: " + error.message);
            setView('error');
        }
    }, []);

    // --- API HANDLERS ---
    const startSimulation = async () => {
        if (!scenario) {
            setErrorMessage("Please enter a scenario.");
            setView('error');
            setTimeout(() => setView('setup'), 3000);
            return;
        }
        setView('loading');
        setErrorMessage('');

        const prompt = `You are a sophisticated life simulation engine. The user's goal is: "${scenario}" over a simulated period of ${duration}.
Your first step is to analyze the user's goal and generate a list of 5-10 core skills required to achieve it.
Then, generate a series of 10 to 20 realistic, challenging, and progressive tasks that help the user develop these skills. These tasks should build on each other to form a coherent narrative.
Use Google Search for up-to-date information to make the scenarios relevant and grounded in reality.

For each task, provide:
- A rich description.
- A clear question for the user to answer.
- An array of the relevant 'skills' from the list you generated.
- A taskType ('multipleChoice', 'freeText', 'math', 'coding', 'rolePlay').
- If 'multipleChoice', provide 2-4 concise options.
- If 'coding', ask for a specific code snippet.
- If 'math', pose a quantitative problem.
- If 'rolePlay', specify the 'character' the user is interacting with.

Structure the entire output as a single JSON object. The object must have two top-level keys:
1. "skills": An array of strings representing the generated skill names.
2. "tasks": An array of the task objects you've designed.

Do not wrap the JSON in markdown or any other text.`;

        try {
            if (!aiRef.current) throw new Error("AI not initialized");
            
            const response = await aiRef.current.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                }
            });

            let jsonString = response.text.trim();
            
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');
            
            if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
                console.error("Malformed response from AI, no JSON object found in:", jsonString);
                throw new Error("The AI response did not contain a valid JSON object.");
            }

            jsonString = jsonString.substring(firstBrace, lastBrace + 1);
            
            const resultJson = JSON.parse(jsonString);
            if (resultJson.tasks && resultJson.tasks.length > 0 && resultJson.skills && resultJson.skills.length > 0) {
                setTasks(resultJson.tasks);
                const initialSkills = resultJson.skills.reduce((acc: Record<string, number>, skill: string) => {
                    acc[skill] = 0;
                    return acc;
                }, {});
                setSkills(initialSkills);
                setCurrentTaskIndex(0);
                setHistory([]);
                setInventory([]);
                setPerformanceAnalysis('');
                setView('simulation');
            } else {
                throw new Error("The generated simulation is incomplete. It's missing 'skills' or 'tasks'.");
            }
        } catch (error: any) {
            console.error(error);
            setErrorMessage(`Failed to generate simulation. The AI response might be malformed. Error: ${error.message}. Please try again.`);
            setView('error');
        }
    };
    
    const handleNextTask = () => {
        const currentTask = tasks[currentTaskIndex];
        
        const newHistoryItem: HistoryItem = {
            task: currentTask,
            answer: userAnswer,
            feedback: userFeedback,
            timestamp: Date.now()
        };
        const newHistory = [...history, newHistoryItem];
        setHistory(newHistory);
        
        const newSkills = { ...skills };
        currentTask.skills.forEach(skill => {
            newSkills[skill] = (newSkills[skill] || 0) + 1;
        });
        setSkills(newSkills);

        const newInventory = [...inventory];
        const descriptionLower = currentTask.description.toLowerCase();
        if (descriptionLower.includes('report') || descriptionLower.includes('plan') || descriptionLower.includes('document') || descriptionLower.includes('product')) {
             newInventory.push({
                name: `Artifact from Task ${currentTaskIndex + 1}`,
                description: `Based on your work for: "${currentTask.question}"`,
                sourceTaskIndex: currentTaskIndex,
            });
            setInventory(newInventory);
        }

        setUserAnswer('');
        setUserFeedback('');
        if (currentTaskIndex < tasks.length - 1) {
            setCurrentTaskIndex(currentTaskIndex + 1);
        } else {
            alert("Congratulations! You have completed the simulation.");
            setView('setup');
        }
    };

    const handleDeepDive = async (item: InventoryItem) => {
        if (!aiRef.current) return;
        setIsDiving(true);
        const divePrompt = `The user is in a simulation with the goal: "${scenario}".
        They want to "go deeper" on an inventory item they created earlier.
        The item is: "${item.name}: ${item.description}".
        The original task was: "${tasks[item.sourceTaskIndex].description}".
        The user's answer to that task was: "${history.find(h => h.task === tasks[item.sourceTaskIndex])?.answer}".
        
        Generate a single, new, focused follow-up task based on this context. This should feel like a natural next step or a detailed exploration of the original work.
        Return a single JSON object for this task, adhering to the specified schema. The task should use skills relevant to the original task.`;

        try {
            const response = await aiRef.current.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: divePrompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            description: { type: Type.STRING },
                            question: { type: Type.STRING },
                            taskType: { type: Type.STRING, enum: ['multipleChoice', 'freeText', 'math', 'coding', 'rolePlay'] },
                            options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                            skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                            character: { type: Type.STRING, nullable: true },
                        },
                        required: ['description', 'question', 'taskType', 'skills']
                    }
                }
            });
            const newTask = JSON.parse(response.text);
            const newTasks = [...tasks];
            newTasks.splice(currentTaskIndex + 1, 0, newTask);
            setTasks(newTasks);
        } catch (error) {
            console.error("Deep Dive failed:", error);
            alert("Sorry, the AI could not generate a follow-up task. Please try again.");
        } finally {
            setIsDiving(false);
        }
    };

    const handleAnalyzePerformance = async () => {
        if (!aiRef.current || history.length === 0) return;
        setIsAnalyzing(true);
        setPerformanceAnalysis('');

        const historySummary = history.map(item =>
            `Task: "${item.task.question}"\nAnswer: "${item.answer}"${item.feedback ? `\nRationale: "${item.feedback}"` : ''}`
        ).join('\n\n---\n\n');

        const analysisPrompt = `You are an expert career coach and performance analyst.
        The user's goal is: "${scenario}".
        Analyze the user's entire performance history provided below.
        
        Based on their decisions, reasoning, and the tasks they faced, provide a concise but insightful analysis covering:
        1.  **Estimated Professional Level:** A grounded estimation of their current professional level or readiness for their goal (e.g., 'Entry-Level Analyst', 'Aspiring Founder with Strong Product Sense', 'Mid-Level Manager').
        2.  **Key Strengths:** 2-3 notable strengths observed from their answers.
        3.  **Areas for Improvement:** 2-3 specific, actionable areas where they could improve.
        
        Format your response clearly in markdown.
        
        PERFORMANCE HISTORY:
        ${historySummary}
        `;

        try {
            const response = await aiRef.current.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: analysisPrompt
            });
            setPerformanceAnalysis(response.text);
        } catch (error) {
            console.error("Analysis failed:", error);
            setPerformanceAnalysis("Sorry, the performance analysis failed. Please try again later.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const resetSimulation = () => {
        if(window.confirm("Are you sure you want to end this simulation and start a new one? All progress will be lost.")) {
            localStorage.removeItem('lifeSimState');
            window.location.reload();
        }
    };

    // --- RENDER HELPERS ---
    const renderContent = () => {
        switch (view) {
            case 'loading':
                return <Loader />;
            case 'error':
                return <ErrorDisplay message={errorMessage} onReset={() => setView('setup')} />;
            case 'setup':
                return (
                    <SetupScreen
                        scenario={scenario}
                        setScenario={setScenario}
                        duration={duration}
                        setDuration={setDuration}
                        onStart={startSimulation}
                    />
                );
            case 'simulation':
                return (
                    <div className="simulationGrid" style={styles.simulationGrid}>
                        <InventoryPanel
                            inventory={inventory}
                            onDeepDive={handleDeepDive}
                            isDiving={isDiving}
                        />
                        <TaskPanel
                            task={tasks[currentTaskIndex]}
                            taskNumber={currentTaskIndex + 1}
                            totalTasks={tasks.length}
                            onNext={handleNextTask}
                            userAnswer={userAnswer}
                            setUserAnswer={setUserAnswer}
                            userFeedback={userFeedback}
                            setUserFeedback={setUserFeedback}
                        />
                        <SkillTreePanel
                            skills={skills}
                            task={tasks[currentTaskIndex]}
                            tasks={tasks}
                            onAnalyze={handleAnalyzePerformance}
                            isAnalyzing={isAnalyzing}
                            analysis={performanceAnalysis}
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div style={styles.appContainer}>
            <header style={styles.header}>
                <h1 style={styles.title}>Life Simulator AI</h1>
                {view === 'simulation' && (
                    <div>
                        <button onClick={() => setMindModelOpen(true)} style={styles.mindModelButton} aria-label="Open Mind Model">
                           🧠
                        </button>
                         <button onClick={resetSimulation} style={styles.resetButton} aria-label="Reset Simulation">
                           🔄
                        </button>
                    </div>
                )}
            </header>
            <main style={styles.mainContent}>
                {renderContent()}
            </main>
            {isMindModelOpen && (
                <MindModelChat
                    ai={aiRef.current}
                    chatRef={chatRef}
                    scenario={scenario}
                    history={history}
                    onClose={() => setMindModelOpen(false)}
                />
            )}
        </div>
    );
};

// --- SUB-COMPONENTS ---
const Loader = () => <div style={styles.centeredContainer}><div style={styles.loader}></div><p style={{color: 'var(--text-secondary-color)'}}>Generating your reality... this may take a moment.</p></div>;
const ErrorDisplay = ({ message, onReset }: { message: string, onReset: () => void }) => <div style={styles.centeredContainer}><h2 style={{color: 'var(--error-color)'}}>An Error Occurred</h2><p style={{...styles.card, backgroundColor: '#2a2a2a', textAlign: 'center'}}>{message}</p><button style={styles.button} onClick={onReset}>Try Again</button></div>;
const SetupScreen = ({ scenario, setScenario, duration, setDuration, onStart }: any) => (<div style={styles.setupContainer}><h2 style={{fontWeight: 600}}>Design Your Destiny</h2><p style={{color: 'var(--text-secondary-color)', maxWidth: '600px', textAlign: 'center', lineHeight: 1.6}}>Enter a role, a goal, or any scenario you want to experience. The AI will generate a personalized simulation to help you train, prepare, and explore possibilities.</p><div style={styles.card}><textarea style={styles.textarea} value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="e.g., 'Launch a successful tech startup' or 'Become a renowned marine biologist'" aria-label="Simulation Scenario" /><div style={styles.durationSelector}><label style={{color: 'var(--text-secondary-color)', marginRight: '10px'}}>Simulation Duration:</label><select style={styles.select} value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Simulation Duration">{['1 month', '6 months', '1 year', '5 years', '10 years', '20 years'].map(d => <option key={d} value={d}>{d}</option>)}</select></div><button style={styles.button} onClick={onStart}>Begin Simulation</button></div></div>);

const InventoryPanel = ({ inventory, onDeepDive, isDiving }: { inventory: InventoryItem[], onDeepDive: (item: InventoryItem) => void, isDiving: boolean }) => (
    <div style={styles.panel} id="inventory-panel">
        <h3 style={styles.panelHeader}>Inventory</h3>
        {isDiving && <div style={{textAlign: 'center', padding: '10px'}}><div style={{...styles.miniLoader, margin: '0 auto'}}></div><p style={{fontSize: '0.8rem', color:'var(--text-secondary-color)'}}>Generating deep dive...</p></div>}
        {inventory.length > 0 ? (
             <ul style={styles.list}>
                {inventory.map((item: InventoryItem, index: number) => (
                    <li key={index} style={styles.listItem}>
                        <strong>{item.name}</strong>
                        <p style={{fontSize: '0.8rem', color: 'var(--text-secondary-color)', margin: '4px 0 8px'}}>{item.description}</p>
                        <button style={styles.deepDiveButton} onClick={() => onDeepDive(item)} disabled={isDiving}>Go Deeper</button>
                    </li>
                ))}
            </ul>
        ) : <p style={styles.placeholderText}>No items yet.</p>}
    </div>
);

const TaskPanel = ({ task, taskNumber, totalTasks, onNext, userAnswer, setUserAnswer, userFeedback, setUserFeedback }: any) => {
    const renderTaskInput = () => {
        switch(task.taskType) {
            case 'multipleChoice':
                return (
                    <div style={styles.mcqContainer}>
                        {task.options.map((option: string, index: number) => (
                            <button key={index} onClick={() => setUserAnswer(option)} style={userAnswer === option ? styles.mcqOptionSelected : styles.mcqOption}>
                                {option}
                            </button>
                        ))}
                    </div>
                );
            case 'coding':
                return (
                    <textarea
                        style={{...styles.textarea, fontFamily: 'monospace', minHeight: '150px'}}
                        rows={8}
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Write your code here..."
                        aria-label="Task Answer (Coding)"
                    />
                );
            case 'math':
                 return (
                    <input
                        type="text"
                        style={styles.input}
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Enter your numerical answer or formula"
                        aria-label="Task Answer (Math)"
                    />
                );
            case 'rolePlay':
                return (
                    <>
                        <blockquote style={styles.blockquote}>
                            <p>You are interacting with: <strong>{task.character}</strong></p>
                        </blockquote>
                        <textarea
                            style={styles.textarea}
                            rows={6}
                            value={userAnswer}
                            onChange={(e) => setUserAnswer(e.target.value)}
                            placeholder="How do you respond?"
                            aria-label="Task Answer (Role Play)"
                        />
                    </>
                );
            case 'freeText':
            default:
                return (
                    <textarea
                        style={styles.textarea}
                        rows={6}
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Type your detailed response here..."
                        aria-label="Task Answer"
                    />
                );
        }
    };
    
    return (
        <div style={styles.mainTaskPanel} className="mainTaskPanel">
            <p style={{color: 'var(--text-secondary-color)'}}>Task {taskNumber} of {totalTasks}</p>
            <div style={styles.card}>
                <p style={{lineHeight: 1.6, whiteSpace: 'pre-wrap'}}>{task.description}</p>
                <hr style={styles.hr}/>
                <h3 style={{fontWeight: 600}}>{task.question}</h3>
                {renderTaskInput()}
            </div>
            <div style={{...styles.card, marginTop: '20px'}}>
                 <textarea
                    style={{...styles.textarea, minHeight: '60px'}}
                    value={userFeedback}
                    onChange={(e) => setUserFeedback(e.target.value)}
                    placeholder="Optional: Write your private feedback or reasoning for this decision."
                    aria-label="Decision Feedback"
                />
            </div>
            <button style={styles.button} onClick={onNext} disabled={!userAnswer}>
                Confirm Decision & Proceed
            </button>
        </div>
    );
};

const SkillTreePanel = ({ skills, task, tasks, onAnalyze, isAnalyzing, analysis }: { skills: Record<string, number>, task: Task, tasks: Task[], onAnalyze: () => void, isAnalyzing: boolean, analysis: string }) => {
    const totalPoints = Object.values(skills).reduce((sum, count) => sum + count, 0);
    return (
    <div style={styles.panel} id="stats-panel">
        <h3 style={styles.panelHeader}>Skill Tree</h3>
        {Object.keys(skills).length > 0 ? (
            <div>
                {Object.entries(skills).map(([skill, count]) => (
                    <div key={skill} style={{marginBottom: '12px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.9rem'}}>
                            <span>{skill}</span>
                            <span style={{color: 'var(--text-secondary-color)'}}>{count}</span>
                        </div>
                        <div style={styles.statBarBackground}>
                            <div style={{...styles.statBarFill, width: `${(count / Math.max(1, tasks.filter(t => t.skills.includes(skill)).length)) * 100}%`}}></div>
                        </div>
                    </div>
                ))}
            </div>
        ) : <p style={styles.placeholderText}>Complete tasks to grow your skills.</p>}
        
        <div style={{marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)'}}>
            <h4 style={{marginTop: 0, marginBottom: '10px'}}>Performance Analysis</h4>
            {analysis ? (
                <pre style={styles.analysisText}>{analysis}</pre>
            ) : (
                <p style={styles.placeholderText}>Click the button below to get an AI-powered analysis of your performance so far.</p>
            )}
             <button style={styles.buttonSecondary} onClick={onAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? 'Analyzing...' : 'Analyze Performance'}
            </button>
        </div>

        <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)'}}>
          <p style={{fontSize: '0.8rem', color: 'var(--text-secondary-color)', fontWeight: 'bold'}}>Task Skills:</p>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px'}}>
            {task.skills.map((d: string) => <span key={d} style={styles.tag}>{d}</span>)}
          </div>
        </div>
    </div>
)};


const MindModelChat = ({ ai, chatRef, scenario, history, onClose }: { ai: GoogleGenAI | null, chatRef: React.MutableRefObject<Chat | null>, scenario: string, history: HistoryItem[], onClose: () => void }) => {
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    
    useEffect(() => {
        if (!ai) return;

        const historySummary = history.map(item =>
            `Task: "${item.task.question}"\nUser's Answer: "${item.answer}"${item.feedback ? `\nUser's Rationale: "${item.feedback}"` : ''}`
        ).join('\n\n');

        const systemInstruction = `You are a personalized AI mentor. The user is in a simulation with the goal: "${scenario}".
        Their past decisions and reasoning are provided below. Analyze their actions, tone, and feedback to understand their decision-making style.
        Adapt your personality and advice to be the most effective mentor for this specific user. Be concise, insightful, and forward-looking.
        
        USER'S SIMULATION HISTORY:
        ${historySummary || 'No history yet. Start by introducing yourself and asking how you can help.'}
        `;
        
        chatRef.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: systemInstruction,
            },
        });

        setMessages([{ role: 'model', text: 'Hello! I am your personalized Mind Model. I have reviewed your simulation progress. How can I help you strategize or make better decisions?' }]);
    }, [ai, scenario, history]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading || !chatRef.current) return;
        
        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setInput('');
        setIsLoading(true);

        try {
            const stream = await chatRef.current.sendMessageStream({ message: userMessage });
            let modelResponse = '';
            setMessages(prev => [...prev, { role: 'model', text: '' }]);

            for await (const chunk of stream) {
                modelResponse += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].text = modelResponse;
                    return newMessages;
                });
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <div style={styles.modalHeader}><h3>Mind Model</h3><button onClick={onClose} style={styles.closeButton}>&times;</button></div>
                <div style={styles.chatWindow}>
                    {messages.map((msg, index) => <div key={index} style={msg.role === 'user' ? styles.userMessage : styles.modelMessage}>{msg.text}</div>)}
                    {isLoading && <div style={styles.modelMessage}>...</div>}
                    <div ref={messagesEndRef} />
                </div>
                <div style={styles.chatInputContainer}>
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="Ask for advice..." style={styles.chatInput} disabled={isLoading}/>
                    <button onClick={sendMessage} disabled={isLoading || !input.trim()} style={styles.sendButton}>Send</button>
                </div>
            </div>
        </div>
    );
};


// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    appContainer: { display: 'flex', flexDirection: 'column', minHeight: '100vh', },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', backgroundColor: 'var(--surface-color)', borderBottom: '1px solid var(--border-color)', },
    title: { fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--primary-variant-color)', },
    mindModelButton: { background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', padding: '0 10px', },
    resetButton: { background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '0 10px', },
    mainContent: { flex: 1, padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', },
    centeredContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', width: '100%', },
    setupContainer: { width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', },
    card: { backgroundColor: 'var(--surface-color)', borderRadius: '8px', padding: '1.5rem', border: '1px solid var(--border-color)', width: '100%', boxSizing: 'border-box', },
    textarea: { width: '100%', backgroundColor: '#2a2a2a', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '10px', fontSize: '1rem', minHeight: '100px', boxSizing: 'border-box', resize: 'vertical', },
    input: { width: '100%', backgroundColor: '#2a2a2a', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '10px', fontSize: '1rem', boxSizing: 'border-box',},
    durationSelector: { display: 'flex', alignItems: 'center', marginTop: '1rem', },
    select: { backgroundColor: '#2a2a2a', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', fontSize: '1rem', },
    button: { backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '12px 20px', fontSize: '1rem', fontWeight: 500, cursor: 'pointer', marginTop: '1rem', width: '100%', transition: 'background-color 0.2s', opacity: 1 },
    buttonSecondary: { backgroundColor: 'transparent', color: 'var(--primary-variant-color)', border: '1px solid var(--primary-variant-color)', borderRadius: '4px', padding: '10px 15px', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', marginTop: '1rem', width: '100%', transition: 'background-color 0.2s', },
    deepDiveButton: { backgroundColor: 'rgba(131, 116, 211, 0.2)', color: 'var(--primary-variant-color)', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', width: '100%', },
    simulationGrid: { display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '2rem', width: '100%', maxWidth: '1400px', alignItems: 'flex-start', },
    panel: { backgroundColor: 'var(--surface-color)', borderRadius: '8px', padding: '1.5rem', border: '1px solid var(--border-color)', height: 'calc(100vh - 150px)', overflowY: 'auto', },
    panelHeader: { marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem', marginBottom: '1rem', },
    mainTaskPanel: {},
    list: { listStyle: 'none', padding: 0, margin: 0, },
    listItem: { padding: '1rem', borderBottom: '1px solid var(--border-color)', },
    placeholderText: { color: 'var(--text-secondary-color)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' },
    hr: { border: 'none', borderTop: '1px solid var(--border-color)', margin: '1rem 0', },
    mcqContainer: { display: 'flex', flexDirection: 'column', gap: '10px', },
    mcqOption: { width: '100%', padding: '12px', backgroundColor: '#2a2a2a', border: '1px solid var(--border-color)', color: 'var(--text-color)', borderRadius: '4px', textAlign: 'left', cursor: 'pointer', transition: 'background-color 0.2s, border-color 0.2s', },
    mcqOptionSelected: { width: '100%', padding: '12px', backgroundColor: 'var(--primary-variant-color)', border: '1px solid var(--primary-color)', color: 'white', borderRadius: '4px', textAlign: 'left', cursor: 'pointer', },
    statBarBackground: { height: '8px', backgroundColor: '#2a2a2a', borderRadius: '4px', overflow: 'hidden' },
    statBarFill: { height: '100%', backgroundColor: 'var(--primary-variant-color)', borderRadius: '4px', transition: 'width 0.3s ease-in-out' },
    tag: { backgroundColor: '#333', color: 'var(--text-secondary-color)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', },
    blockquote: { margin: '0 0 1rem 0', padding: '0.8rem', backgroundColor: 'rgba(131, 116, 211, 0.1)', borderLeft: '3px solid var(--primary-variant-color)', color: 'var(--text-secondary-color)', fontSize: '0.9rem' },
    loader: { border: '4px solid var(--surface-color)', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', },
    miniLoader: { border: '2px solid var(--surface-color)', borderTop: '2px solid var(--primary-color)', borderRadius: '50%', width: '16px', height: '16px', animation: 'spin 1s linear infinite', },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, },
    modalContent: { backgroundColor: 'var(--surface-color)', borderRadius: '8px', width: '90%', maxWidth: '600px', height: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)', },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-color)', },
    closeButton: { background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-color)', cursor: 'pointer', },
    chatWindow: { flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', },
    userMessage: { alignSelf: 'flex-end', backgroundColor: 'var(--primary-color)', color: 'white', borderRadius: '15px 15px 0 15px', padding: '10px 15px', maxWidth: '80%', whiteSpace: 'pre-wrap', wordWrap: 'break-word', },
    modelMessage: { alignSelf: 'flex-start', backgroundColor: '#2a2a2a', color: 'var(--text-color)', borderRadius: '15px 15px 15px 0', padding: '10px 15px', maxWidth: '80%', whiteSpace: 'pre-wrap', wordWrap: 'break-word', },
    chatInputContainer: { display: 'flex', padding: '1rem', borderTop: '1px solid var(--border-color)', },
    chatInput: { flex: 1, backgroundColor: '#2a2a2a', border: '1px solid var(--border-color)', color: 'var(--text-color)', borderRadius: '20px', padding: '10px 15px', fontSize: '1rem', outline: 'none', },
    sendButton: { marginLeft: '10px', backgroundColor: 'var(--primary-color)', border: 'none', color: 'white', borderRadius: '20px', padding: '10px 20px', cursor: 'pointer', },
    analysisText: { fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'inherit', margin: 0, color: 'var(--text-color)' }
};

// --- RENDER APP ---
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            button:disabled { opacity: 0.5; cursor: not-allowed; }
        `}</style>
        <App />
    </React.StrictMode>
);

const styleSheet = document.createElement("style")
styleSheet.innerText = `
@media (max-width: 1200px) {
    .simulationGrid {
        grid-template-columns: 1fr 2fr;
        grid-template-areas: "task task" "inventory stats";
    }
    .panel {
      height: auto;
      max-height: 40vh;
    }
    .mainTaskPanel { grid-area: task; }
    #inventory-panel { grid-area: inventory; }
    #stats-panel { grid-area: stats; }
}
@media (max-width: 768px) {
    .simulationGrid {
        display: flex;
        flex-direction: column;
    }
    .mainContent { padding: 1rem; }
    .header { padding: 1rem; }
}
`
document.head.appendChild(styleSheet)
