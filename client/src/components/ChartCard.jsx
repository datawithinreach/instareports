// components/ChartCard.jsx
import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import MonacoEditor from "@monaco-editor/react";
import { VegaLite } from "react-vega";

function ChartCard({ spec, onSave }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedSpec, setEditedSpec] = useState(JSON.stringify(spec, null, 2));

    const handleSave = () => {
        try {
            const newSpec = JSON.parse(editedSpec);
            console.log("New Spec:", newSpec);
            onSave(newSpec);
            setIsEditing(false);
        } catch (error) {
            console.error("Invalid JSON:", error);
        }
    };
    const containerRef = useRef(null);
    const [chartWidth, setChartWidth] = useState(0);
    useEffect(() => {
        if (!containerRef.current) return;

        const updateWidth = () => {
            const width = containerRef.current.getBoundingClientRect().width;
            setChartWidth(width-32);
        };

        // Initial width
        updateWidth();

        // Watch for container size changes
        const resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
    }, [spec]);
    return (
        <div className="relative">
            <div className={`${isEditing ? "hidden" : "block"}`}>
                <div ref={containerRef} className="flex bg-white rounded-lg justify-center">
                    <VegaLite
                        className="min-w-96"
                        style={spec.width === "container" ? { width: chartWidth } : {}}
                        spec={spec}
                        actions={true}
                    />
                </div>
                <div className="flex justify-end gap-2 mt-2">
                    <button
                        onClick={() => setIsEditing(true)}
                        className="btn btn-sm btn-primary"
                    >
                        Edit
                    </button>
                </div>
            </div>

            {/* Editor View */}
            <div className={`${isEditing ? "block" : "hidden"}`}>
                <div className="p-4 bg-base-300 rounded-lg">
                    <MonacoEditor
                        height="450px"
                        language="json"
                        theme="vs-dark"
                        value={editedSpec}
                        onChange={setEditedSpec}
                        options={{
                            minimap: { enabled: false },
                            lineNumbers: "on",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                        }}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="btn btn-ghost btn-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="btn btn-primary btn-sm"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

ChartCard.propTypes = {
    spec: PropTypes.object.isRequired,
    onSave: PropTypes.func.isRequired,
};

export default ChartCard;
