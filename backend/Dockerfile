# Use the official Rust image as the build environment
FROM rust:latest as builder

# Set the working directory
WORKDIR /usr/src/app

# Copy the source code into the container
COPY . .

# Build the application in release mode
RUN cargo build --release

# Use a minimal base image to reduce the size of the final image
FROM debian:latest

# Copy the built binary from the builder stage
COPY --from=builder /usr/src/app/target/release/backend /usr/local/bin/backend

# Expose the port that your application will run on
EXPOSE 8080

# Set the startup command to run your application
CMD ["backend"]