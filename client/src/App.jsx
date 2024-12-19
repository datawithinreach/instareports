import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
// import { generateText } from "./services/api";
import "./App.css";
import FileUpload from "./components/FileUpload";
import ChartCard from "./components/ChartCard";
import {
    generateAnalysisQuestions,
    generateInsights,
    generateStoryOutline,
    generateStory,
} from "./services/api";
// import loadingSvg from "./assets/90-ring-with-bg.svg";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import vegaEmbed from "vega-embed";

function App() {
    const [dataUrl, setDataUrl] = useState(null);
    const [generatingQuestions, setGeneratingQuestions] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [insights, setInsights] = useState(null);
    const [analyzingInsights, setAnalyzingInsights] = useState(false);
    const [includeInsights, setIncludeInsights] = useState(false);

    const handleDataChange = (url) => {
        setDataUrl(url);
        setQuestions([]); // Reset questions when new file uploaded
        setInsights(null); // Reset insights when new file uploaded
    };

    // In App.jsx, add new state
    const [keptQuestions, setKeptQuestions] = useState([]);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editedQuestion, setEditedQuestion] = useState("");
    const [customInstruction, setCustomInstruction] = useState("");
    const [showCustomInstruction, setShowCustomInstruction] = useState(false);

    const generateQuestions = async () => {
        if (!dataUrl) return;

        setGeneratingQuestions(true);
        try {
            const newQuestions = await generateAnalysisQuestions(
                dataUrl,
                customInstruction || null,
                includeInsights ? insights?.summary : null,
                keptQuestions
            );
            // Combine kept questions with new ones
            setQuestions([...keptQuestions, ...newQuestions]);
        } catch (error) {
            console.error("Error:", error);
        } finally {
            setGeneratingQuestions(false);
        }
    };

    const handleGenerateInsights = async () => {
        if (!dataUrl || !(questions.length || keptQuestions.length)) return;

        setAnalyzingInsights(true);
        try {
            // Combine both question lists and remove duplicates
            const allQuestions = [...new Set([...keptQuestions, ...questions])];
            const results = await generateInsights(dataUrl, allQuestions);
            setInsights(results);
        } catch (error) {
            console.error("Error generating insights:", error);
        } finally {
            setAnalyzingInsights(false);
        }
    };

    const [storyOutline, setStoryOutline] = useState(null);
    const [generatingStoryOutline, setGeneratingStoryOutline] = useState(false);
    // Add state for editing
    const [editingTitle, setEditingTitle] = useState(false);
    const [editingSectionIndex, setEditingSectionIndex] = useState(null);
    const [editedTitle, setEditedTitle] = useState("");
    const [editedSection, setEditedSection] = useState(null);
    const handleGenerateStoryOutline = async () => {
        if (!insights?.summary) return;

        setGeneratingStoryOutline(true);
        const outline = await generateStoryOutline(insights.summary);
        setStoryOutline(outline);
        setGeneratingStoryOutline(false);
    };

    const [story, setStory] = useState(null);
    const [generatingStory, setGeneratingStory] = useState(false);

    const handleGenerateStory = async () => {
        if (!storyOutline || !dataUrl) return;

        setGeneratingStory(true);
        try {
            const story = await generateStory(dataUrl, storyOutline);
            // Add width:"container" to each chart spec
            const modifiedSections = story.sections.map((section) => {
                if (section.chart) {
                    return {
                        ...section,
                        chart: {
                            ...section.chart,
                            width: "container"
                        },
                    };
                }
                return section;
            });

            setStory({ ...story, sections: modifiedSections });
        } catch (error) {
            console.error("Error generating story:", error);
        } finally {
            setGeneratingStory(false);
        }
    };
    const handleSaveChartSpec = (index, newSpec) => {
        const newSections = [...story.sections];
        newSections[index].chart = newSpec;

        console.log("newSection", newSections[index]);
        setStory({
            ...story,
            sections: newSections,
        });
    };

    // Add download handler
    const tempChartRef = useRef(null);
    const handleDownload = async () => {
        const zip = new JSZip();

        // Create markdown content
        const markdown = `# ${story.title}\n\n${story.sections
            .map(
                (section, index) =>
                    `${section.text.trim()}\n${
                        section.chart
                            ? `\n![Chart ${index + 1}](./images/chart-${
                                  index + 1
                              }.png)\n`
                            : ""
                    }`
            )
            .join("\n")}`;

        // Add markdown file to zip
        zip.file("story.md", markdown);

        // Add markdown file to zip
        zip.file("story.md", markdown);

        // Create images folder
        const images = zip.folder("images");

        // Export each chart as PNG
        for (let i = 0; i < story.sections.length; i++) {
            const section = story.sections[i];
            if (section.chart) {
                try {
                    // Embed Vega chart and export as PNG
                    const result = await vegaEmbed(
                        tempChartRef.current,
                        {...section.chart, width: 1024}
                    );

                    const png = await result.view.toImageURL("png");

                    // Convert data URL to blob
                    const response = await fetch(png);
                    const blob = await response.blob();

                    // // Add to zip
                    images.file(`chart-${i + 1}.png`, blob);
                } catch (error) {
                    console.error(`Error exporting chart ${i + 1}:`, error);
                }
            }
        }

        // Generate and save zip file
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "data-story.zip");
    };

    return (
        <div className="container mx-auto p-4 max-w-4xl py-20">
            <div ref={tempChartRef} style={{ display: "none" }}/>
            <h1 className="text-3xl font-bold  mb-2">📊 InstaReports: </h1>
            <p className="text-lg text-base-content/70  mb-6">
                Turning Your Data into Questions, Insights, and Stories
            </p>
            <FileUpload onDataChange={handleDataChange} />

            {dataUrl && (
                <div className="mt-4 space-y-4">
                    <hr className="my-4 border-base-300" />

                    <button
                        onClick={generateQuestions}
                        disabled={generatingQuestions}
                        className="btn btn-primary"
                    >
                        {generatingQuestions ? (
                            <span className="loading loading-spinner"></span>
                        ) : (
                            "Generate Analysis Questions"
                        )}
                    </button>
                    <div className="collapse bg-base-200 rounded-lg">
                        <input
                            type="checkbox"
                            checked={showCustomInstruction}
                            onChange={(e) =>
                                setShowCustomInstruction(e.target.checked)
                            }
                        />
                        <div className="collapse-title text-sm font-medium flex items-center gap-2">
                            <span>{showCustomInstruction ? "▼" : "▶"}</span>
                            Custom Instructions
                        </div>
                        <div className="collapse-content">
                            <textarea
                                value={customInstruction}
                                onChange={(e) =>
                                    setCustomInstruction(e.target.value)
                                }
                                placeholder="Add custom instruction for question generation"
                                className="textarea textarea-bordered w-full"
                                rows={3}
                            />
                        </div>
                    </div>

                    {insights?.summary && (
                        <div className="form-control badge badge-lg badge-ghost">
                            <label className="label cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeInsights}
                                    onChange={(e) =>
                                        setIncludeInsights(e.target.checked)
                                    }
                                    className="checkbox checkbox-ghost checkbox-xs"
                                />
                                <span className="ml-2 label-text">
                                    Include the{" "}
                                    <a
                                        className="link"
                                        href="#analysis-summary"
                                    >
                                        analysis summary
                                    </a>{" "}
                                    in generation
                                </span>
                            </label>
                        </div>
                    )}
                </div>
            )}

            {questions.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-xl font-semibold mb-3">
                        Analysis Questions
                    </h2>
                    <div className="space-y-2">
                        {questions.map((question, index) => (
                            <div
                                key={index}
                                className="p-3 bg-base-200 rounded-lg"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-grow">
                                        {editingIndex === index ? (
                                            <textarea
                                                value={editedQuestion}
                                                onChange={(e) =>
                                                    setEditedQuestion(
                                                        e.target.value
                                                    )
                                                }
                                                className="textarea textarea-bordered w-full"
                                                rows={3}
                                            />
                                        ) : (
                                            question
                                        )}
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        {editingIndex === index ? (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        const newQuestions = [
                                                            ...questions,
                                                        ];
                                                        newQuestions[index] =
                                                            editedQuestion;
                                                        setQuestions(
                                                            newQuestions
                                                        );
                                                        setEditingIndex(null);
                                                    }}
                                                    className="btn btn-xs btn-primary"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingIndex(null);
                                                        setEditedQuestion("");
                                                    }}
                                                    className="btn btn-xs btn-ghost"
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setEditingIndex(index);
                                                        setEditedQuestion(
                                                            question
                                                        );
                                                    }}
                                                    className="btn btn-xs btn-ghost"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (
                                                            keptQuestions.includes(
                                                                question
                                                            )
                                                        ) {
                                                            setKeptQuestions(
                                                                keptQuestions.filter(
                                                                    (q) =>
                                                                        q !==
                                                                        question
                                                                )
                                                            );
                                                        } else {
                                                            setKeptQuestions([
                                                                ...keptQuestions,
                                                                question,
                                                            ]);
                                                        }
                                                    }}
                                                    className={`btn btn-xs ${
                                                        keptQuestions.includes(
                                                            question
                                                        )
                                                            ? "btn-success"
                                                            : "btn-ghost"
                                                    }`}
                                                >
                                                    {keptQuestions.includes(
                                                        question
                                                    )
                                                        ? "Kept"
                                                        : "Keep"}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setQuestions(
                                                            questions.filter(
                                                                (_, i) =>
                                                                    i !== index
                                                            )
                                                        );
                                                        setKeptQuestions(
                                                            keptQuestions.filter(
                                                                (q) =>
                                                                    q !==
                                                                    question
                                                            )
                                                        );
                                                    }}
                                                    className="btn btn-xs btn-ghost"
                                                >
                                                    🗑
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {questions.length > 0 && (
                <div className="mt-4">
                    <hr className="my-4 border-base-300" />
                    <button
                        onClick={handleGenerateInsights}
                        disabled={analyzingInsights}
                        className="btn btn-secondary"
                    >
                        {analyzingInsights ? (
                            <span className="loading loading-spinner"></span>
                        ) : (
                            "Generate Analysis Insights"
                        )}
                    </button>
                </div>
            )}

            {insights && (
                <div className="mt-6 space-y-6">
                    <h2 id="analysis-summary" className="card-title">
                        Analysis Summary
                    </h2>
                    <div className="card bg-base-200">
                        <div className="card-body">
                            <ReactMarkdown className="prose">
                                {insights.summary}
                            </ReactMarkdown>
                        </div>
                    </div>

                    <div className="collapse collapse-plus border-dashed border-base-300 border-2 rounded-lg">
                        <input type="checkbox" />
                        <div className="collapse-title text-lg font-medium">
                            View Detailed Results
                        </div>
                        <div className="collapse-content">
                            {insights.results.map((result, index) => (
                                <div key={index} className="mb-4">
                                    <h3 className="font-semibold">
                                        {result.question}
                                    </h3>
                                    <ReactMarkdown className="prose mt-2">
                                        {`\`\`\`python\n${result.code}\n\`\`\``}
                                    </ReactMarkdown>
                                    <pre className="bg-base-300 p-4 rounded-lg mt-2 overflow-x-auto">
                                        {result.output}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {insights?.summary && (
                <div className="mt-4">
                    <hr className="my-4 border-base-300" />
                    <button
                        onClick={handleGenerateStoryOutline}
                        disabled={generatingStoryOutline}
                        className="btn btn-accent"
                    >
                        {generatingStoryOutline ? (
                            <span className="loading loading-spinner"></span>
                        ) : (
                            "Generate Data Story Outline"
                        )}
                    </button>
                </div>
            )}

            {storyOutline && (
                <div className="mt-6">
                    <div className="card bg-base-200">
                        <div className="card-body">
                            <h2 className="card-title">Data Story Outline</h2>
                            <div className="flex justify-between items-center mb-4">
                                {editingTitle ? (
                                    <div className="flex gap-2 items-center w-full">
                                        <input
                                            type="text"
                                            value={editedTitle}
                                            onChange={(e) =>
                                                setEditedTitle(e.target.value)
                                            }
                                            className="input input-bordered flex-grow"
                                        />
                                        <button
                                            onClick={() => {
                                                setStoryOutline({
                                                    ...storyOutline,
                                                    title: editedTitle,
                                                });
                                                setEditingTitle(false);
                                            }}
                                            className="btn btn-sm btn-neutral"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() =>
                                                setEditingTitle(false)
                                            }
                                            className="btn btn-sm btn-ghost"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <h1 className="text-3xl font-bold">
                                            {storyOutline.title}
                                        </h1>

                                        <button
                                            onClick={() => {
                                                setEditedTitle(
                                                    storyOutline.title
                                                );
                                                setEditingTitle(true);
                                            }}
                                            className="btn btn-sm btn-outline btn-ghost"
                                        >
                                            Edit Title
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="space-y-4">
                                {storyOutline.sections.map((section, index) => (
                                    <div
                                        key={index}
                                        className="bg-base-200 rounded-lg"
                                    >
                                        <hr className="h-px my-2 bg-base-300 border-0" />
                                        {editingSectionIndex === index ? (
                                            <div className="space-y-4">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const newSections =
                                                                [
                                                                    ...storyOutline.sections,
                                                                ];
                                                            newSections[index] =
                                                                editedSection;
                                                            setStoryOutline({
                                                                ...storyOutline,
                                                                sections:
                                                                    newSections,
                                                            });
                                                            setEditingSectionIndex(
                                                                null
                                                            );
                                                        }}
                                                        className="btn btn-sm btn-neutral"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            setEditingSectionIndex(
                                                                null
                                                            )
                                                        }
                                                        className="btn btn-sm btn-ghost"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <textarea
                                                        value={
                                                            editedSection.text
                                                        }
                                                        onChange={(e) =>
                                                            setEditedSection({
                                                                ...editedSection,
                                                                text: e.target
                                                                    .value,
                                                            })
                                                        }
                                                        className="textarea textarea-bordered w-full"
                                                        rows={4}
                                                    />
                                                    <textarea
                                                        value={
                                                            editedSection.chart
                                                        }
                                                        onChange={(e) =>
                                                            setEditedSection({
                                                                ...editedSection,
                                                                chart: e.target
                                                                    .value,
                                                            })
                                                        }
                                                        className="textarea textarea-bordered w-full"
                                                        rows={4}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative group">
                                                <div className="flex justify-end mb-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditedSection({
                                                                ...section,
                                                            });
                                                            setEditingSectionIndex(
                                                                index
                                                            );
                                                        }}
                                                        className="btn btn-sm btn-outline btn-ghost"
                                                    >
                                                        Edit Section Outline
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <ReactMarkdown className="prose">
                                                        {section.text}
                                                    </ReactMarkdown>
                                                    <ReactMarkdown className="prose">
                                                        {section.chart}
                                                    </ReactMarkdown>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {storyOutline && (
                <div className="mt-4">
                    <hr className="my-4 border-base-300" />
                    <button
                        onClick={handleGenerateStory}
                        disabled={generatingStory}
                        className="btn btn-secondary"
                    >
                        {generatingStory ? (
                            <span className="loading loading-spinner"></span>
                        ) : (
                            "Generate Final Story"
                        )}
                    </button>
                </div>
            )}

            {story && (
                <div className="mt-6">
                    <div className="card bg-base-200">
                        <div className="card-body">
                            <h1 className="text-3xl font-bold mb-4">
                                {story.title}
                            </h1>

                            {story.sections.map((section, index) => (
                                <div key={index} className="mb-8">
                                    <ReactMarkdown className="prose mb-4">
                                        {section.text}
                                    </ReactMarkdown>

                                    {section.chart && (
                                        <ChartCard
                                            spec={section.chart}
                                            onSave={(newSpec) =>
                                                handleSaveChartSpec(
                                                    index,
                                                    newSpec
                                                )
                                            }
                                        />
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={handleDownload}
                                className="btn btn-outline btn-ghost my-4"
                                disabled={!story}
                            >
                                Download Story
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
