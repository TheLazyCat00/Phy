class Phy{
    constructor(Matter, myDocument) {
        this.physicsRules;
        this.notStaticElements = [];
        this.Engine = Matter.Engine;
        this.Render = Matter.Render;
        this.Runner = Matter.Runner;
        this.Bodies = Matter.Bodies;
        this.Composite = Matter.Composite;

        this.engine = this.Engine.create();
        this.runner = this.Runner.create();
		
		this.document = myDocument;

        this.render = this.Render.create({
            engine: this.engine,
			//element: this.document.body
        });


        this.elements = Array.from(this.document.querySelectorAll('[data-physics]'));

        this.data = {};

        const metaTag = this.document.querySelector('meta[name="physicsRules"]');
        if (!metaTag) {
            console.log("No rules imported.");
        } else {
            fetch("./" + metaTag.getAttribute('content'))
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch physics rules');
                    }
                    return response.json();
                })
                .then(physicsRules => {
                    // Once the JSON data is fetched, apply the rules
                    this.applyPhysicsRules(physicsRules);
                })
                .catch(error => {
                    // Handle any errors that occurred during fetching
                    console.error('Error fetching physics rules:', error);
                });
        }

        Matter.Events.on(this.engine, 'afterUpdate', () => {
            this.notStaticElements.forEach(element => {
                if (this.data[element.id].isSvg) {
                    let position = this.getPosition(this.data[element.id].object);
                    element.style.left = position.x + this.data[element.id].offset.x + 'px';
                    element.style.top = position.y + this.data[element.id].offset.y + 'px';
                    element.style.transform = `rotateZ(${this.getRotationInDegrees(this.data[element.id].positionBody)}deg)`;
                } else {
                    element.style.left = this.data[element.id].object.position.x - element.offsetWidth / 2 + 'px';
                    element.style.top = this.data[element.id].object.position.y - element.offsetHeight / 2 + 'px';
                    element.style.transform = `rotateZ(${this.getRotationInDegrees(this.data[element.id].object)}deg)`;
                }
            });
        });
    }

    updateShape(id) {
        this.data[id] = this.data[id] || {};
        let element = this.document.getElementById(id);
        if (!element) return; // If element doesn't exist, exit

        let physicsClass = element.getAttribute("data-physics");
        let width = this.getSize(element.style.width || window.getComputedStyle(element).width);
        let height = this.getSize(element.style.height || window.getComputedStyle(element).height);
        let borderRadius = parseFloat(window.getComputedStyle(element).borderRadius);

        // Convert HTML element position to Matter.js world coordinates
        let bodyPositionX = element.getBoundingClientRect().left + width / 2;
        let bodyPositionY = element.getBoundingClientRect().top + height / 2;

        let additionalInfo = { chamfer: { radius: borderRadius } };

        for (const [key, value] of Object.entries(this.physicsRules[physicsClass])) {
            additionalInfo[key] = value;
        }

        if (this.data[id].object){
            this.Composite.remove(this.engine.world, this.data[id].object);
        }
        
        let object;

        if (element.tagName.toLowerCase() === "svg") {
            let everything = this.svgToMatter(id, bodyPositionX, bodyPositionY, additionalInfo);
            object = everything[0];
            let positionBody = everything[1];
            let isSvg = true;
            let northWest = this.getMostNorthernAndWestern(object);
            let offset = { x: northWest.mostWestern - this.getPosition(object).x, y: northWest.mostNorthern - this.getPosition(object).y };
            this.data[id] = { object, physicsClass, isSvg, positionBody, offset};
            element.style.transformOrigin = `${Math.abs(100 / (element.getBBox().width / offset.x))}% ${Math.abs(100 / (element.getBBox().height / offset.y))}%`;
        } else {
            object = this.Bodies.rectangle(bodyPositionX, bodyPositionY, width, height, additionalInfo);
            let isSvg = false;
            this.data[id] = { object, physicsClass, isSvg}
        }
        this.Composite.add(this.engine.world, object);
    }

    applyPhysicsRules(physicsRule) {
        this.physicsRules = physicsRule;
        this.Render.run(this.render);
        this.Runner.run(this.runner, this.engine);
        this.elements.forEach((element) => {
            if (this.physicsRules[element.getAttribute("data-physics")].isStatic !== true) {
                element.style.position = 'absolute';
                this.notStaticElements.push(element);
            }
            this.updateShape(element.id);
        });
        window.addEventListener("resize", () => {
            this.elements.forEach(element => {
                this.updateShape(element.id);
            });
        });
    }

    getSize(size) {
        let value = this.separateNumberAndUnit(size);
        switch (value.unit) {
            case "vh":
                return (value.number / 100) * window.innerHeight;
            case "vw":
                return (value.number / 100) * window.innerWidth;
            case "px":
                return value.number;
        }
    }

    separateNumberAndUnit(str) {
        // Match the number and the unit
        const matches = str.match(/(\d*\.?\d+)([a-zA-Z]+)/);

        if (matches) {
            return {
                number: parseFloat(matches[1]),
                unit: matches[2]
            };
        } else {
            // If no match is found, return undefined for both parts
            return {
                number: undefined,
                unit: undefined
            };
        }
    }

    svgToMatter(svgId, x, y, additionalInfo) {
        let composite = this.Composite.create(); // Create a composite body
        let position;

        this.document.querySelectorAll('#' + svgId).forEach(svg => {
            let shapes = svg.querySelectorAll('polygon, circle, path'); // Select polygons, circles, and paths
            var counter = 0;
            shapes.forEach(shape => {
                let body;
                if (shape.tagName === 'polygon') {
                    let points = shape.getAttribute("points");
                    let vertices = points.split(' ').map(point => {
                        let [x, y] = point.split(',').map(coord => parseFloat(coord));
                        return { x, y };
                    });
                    body = this.Bodies.fromVertices(x, y, vertices, additionalInfo);
                } else if (shape.tagName === 'circle') {
                    let radius = parseFloat(shape.getAttribute('r'));
                    body = this.Bodies.circle(x, y, radius);
                } else if (shape.tagName === 'path') {
                    let vertices = Matter.Svg.pathToVertices(shape);
                    body = this.Bodies.fromVertices(x, y, vertices, additionalInfo);
                }
                if (counter == 0) {
                    position = body;
                }
                this.Composite.add(composite, body); // Add each body to the composite
            });
        });
        return [composite, position]; // Return the composite body
    }

    getMostNorthernAndWestern(composite) {
        // Get all bodies within the composite
        const bodies = this.Composite.allBodies(composite);

        // Initialize variables to store the most northern and western coordinates
        let mostNorthern = Number.POSITIVE_INFINITY;
        let mostWestern = Number.POSITIVE_INFINITY;

        // Loop through all bodies to find the most northern and western coordinates
        bodies.forEach(body => {
            // Get the vertices of the body
            const vertices = body.vertices;

            // Check if vertices is defined and not empty
            if (!vertices || vertices.length === 0) {
                console.warn("Vertices are undefined or empty for body:", body);
                return; // Skip this body if vertices are undefined or empty
            }

            // Loop through all vertices to find the most northern and western coordinates of this body
            vertices.forEach(vertex => {
                // Check if this vertex is more northern
                if (vertex.y < mostNorthern) {
                    mostNorthern = vertex.y;
                }
                // Check if this vertex is more western
                if (vertex.x < mostWestern) {
                    mostWestern = vertex.x;
                }
            });
        });

        // Return an object containing the most northern and western coordinates
        return {
            mostNorthern: mostNorthern,
            mostWestern: mostWestern
        };
    }

    getPosition(body) {
        let i = 0;
        let x = 0;
        let y = 0;
        this.Composite.allBodies(body).forEach(body => {
            x += body.position.x;
            y += body.position.y;
            i++;
        });
        return { x: x / i, y: y / i };
    }

    getRotationInDegrees(body) {
        var degrees = body.angle * (180 / Math.PI);
        return degrees;
    }
}
